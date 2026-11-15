package app.tripwire.guardian

import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Firestore and Auth for the guardian. Same data model as the web family page:
 *   pairingCodes/{code}                 read once to find the device
 *   devices/{deviceId}/guardians/{uid}  the link (the security rules re-check the code)
 *   devices/{deviceId}/alerts/{id}      read-only feed
 *   guardians/{uid}/people/{deviceId}   the guardian's own list
 */
class GuardianRepository {
    private val auth = Firebase.auth
    private val db = Firebase.firestore

    enum class PairResult { OK, NOT_FOUND, FAILED }

    /** The guardian is an anonymous account; no email or name is collected. */
    suspend fun signIn(): String {
        auth.currentUser?.let { return it.uid }
        return checkNotNull(auth.signInAnonymously().await().user) { "Anonymous sign-in returned no user" }.uid
    }

    fun people(uid: String): Flow<List<Person>> = callbackFlow {
        val registration = db.collection("guardians").document(uid).collection("people")
            .addSnapshotListener { snapshot, error ->
                if (error != null || snapshot == null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(snapshot.documents.map { Person(it.id, it.getString("nickname").orEmpty()) }.sortedBy { it.nickname.lowercase() })
            }
        awaitClose { registration.remove() }
    }

    fun alerts(deviceId: String): Flow<List<Alert>> = callbackFlow {
        val registration = db.collection("devices").document(deviceId).collection("alerts")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(50)
            .addSnapshotListener { snapshot, error ->
                if (error != null || snapshot == null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(snapshot.documents.map(::toAlert))
            }
        awaitClose { registration.remove() }
    }

    private fun toAlert(doc: DocumentSnapshot) = Alert(
        id = doc.id,
        createdAtMillis = doc.getTimestamp("createdAt", DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)?.toDate()?.time
            ?: System.currentTimeMillis(),
        scamType = doc.getString("scamType").orEmpty(),
        summary = doc.getString("summary").orEmpty(),
        action = doc.getString("action").orEmpty(),
        outcome = doc.getString("outcome").orEmpty(),
    )

    suspend fun pair(uid: String, code: String, nickname: String): PairResult = try {
        val found = db.collection("pairingCodes").document(code).get().await()
        val deviceId = found.getString("deviceId")
        val expiresAt = found.getTimestamp("expiresAt")?.toDate()?.time ?: 0L
        if (deviceId.isNullOrEmpty() || expiresAt < System.currentTimeMillis() || found.contains("usedBy")) {
            PairResult.NOT_FOUND
        } else {
            // Claim the code and create the link in one write: the rules let each code be claimed once.
            db.batch()
                .update(db.collection("pairingCodes").document(code), "usedBy", uid)
                .set(
                    db.collection("devices").document(deviceId).collection("guardians").document(uid),
                    mapOf("code" to code, "pairedAt" to FieldValue.serverTimestamp()),
                )
                .commit().await()
            db.collection("guardians").document(uid).collection("people").document(deviceId)
                .set(mapOf("nickname" to nickname, "addedAt" to FieldValue.serverTimestamp())).await()
            PairResult.OK
        }
    } catch (_: Exception) {
        PairResult.FAILED
    }
}
