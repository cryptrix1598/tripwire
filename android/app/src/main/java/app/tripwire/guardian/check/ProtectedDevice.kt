package app.tripwire.guardian.check

import com.google.firebase.Firebase
import com.google.firebase.Timestamp
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.firestore
import java.security.SecureRandom
import java.util.Date
import kotlinx.coroutines.tasks.await

/**
 * This phone as the protected device, so a family member is told when the
 * person hangs up on a scam call. The same Firestore documents and security
 * rules as the extension: an eight-digit code that lives five minutes, a link
 * that shows nothing until the person taps "Yes, allow", and alerts that can
 * only hold fixed values (one sentence per kind of scam, enforced by the rules).
 */
class ProtectedDevice {
    private val db by lazy { Firebase.firestore }
    private var liveCode: String? = null

    private suspend fun uid(): String {
        val auth = Firebase.auth
        auth.currentUser?.let { return it.uid }
        return checkNotNull(auth.signInAnonymously().await().user).uid
    }

    /** A new code for the family member to type on the family page or in Tripwire Guardian. */
    suspend fun showCode(): String {
        val me = uid()
        db.collection("devices").document(me).set(mapOf("createdAt" to FieldValue.serverTimestamp()), SetOptions.merge()).await()
        // Only one live code at a time, as in the extension: the previous one stops working.
        liveCode?.let { old -> runCatching { db.collection("pairingCodes").document(old).delete().await() } }
        liveCode = null
        val random = SecureRandom()
        // A number someone else is still using is refused by the rules; try a few others.
        repeat(5) {
            val code = FamilyAlerts.newCode(random)
            val written = runCatching {
                db.collection("pairingCodes").document(code).set(
                    mapOf(
                        "deviceId" to me,
                        "createdAt" to FieldValue.serverTimestamp(),
                        "expiresAt" to Timestamp(Date(System.currentTimeMillis() + 5 * 60_000)),
                    ),
                ).await()
            }.isSuccess
            if (written) {
                liveCode = code
                return code
            }
        }
        error("Could not create a pairing code")
    }

    /** Who is waiting for "Yes, allow" (their first names), and how many are already allowed. */
    suspend fun family(): Pair<List<String>, Int> {
        val links = db.collection("devices").document(uid()).collection("guardians").get().await().documents
        val waiting = links.filter { it.getBoolean("approved") != true }
        return waiting.map { it.getString("name").orEmpty() } to (links.size - waiting.size)
    }

    /** "Yes, allow" approves the link made with the live code; "No" removes every waiting link. The code is retired either way. */
    suspend fun decide(allow: Boolean) {
        val me = uid()
        val links = db.collection("devices").document(me).collection("guardians").get().await().documents
        for (link in links.filter { it.getBoolean("approved") != true }) {
            if (allow && link.getString("code") == liveCode) link.reference.update("approved", true).await()
            else link.reference.delete().await()
        }
        liveCode?.let { db.collection("pairingCodes").document(it).delete().await() }
        liveCode = null
    }

    /**
     * Tell the family the person hung up on a likely scam call. Written together with the
     * device's alert clock, which the rules let move once every 15 seconds.
     */
    suspend fun sendCallAlert(result: CheckResult, who: CallWho?) {
        val me = uid()
        if (family().second == 0) return
        val type = FamilyAlerts.scamType(result, who)
        val batch = db.batch()
        batch.set(db.collection("devices").document(me), mapOf("lastAlertAt" to FieldValue.serverTimestamp()), SetOptions.merge())
        batch.set(
            db.collection("devices").document(me).collection("alerts").document(),
            mapOf(
                "createdAt" to FieldValue.serverTimestamp(),
                "scamType" to type,
                "summary" to FamilyAlerts.SUMMARY.getValue(type),
                "action" to "live_call",
                "outcome" to "stopped",
            ),
        )
        batch.commit().await()
    }
}

/** The pure part of family alerts, unit tested against firestore.rules. */
object FamilyAlerts {
    /** The fixed sentence for each kind of scam this check can name. Must match summaryFor() in firestore.rules. */
    val SUMMARY = mapOf(
        "tech_support" to "A page claimed the computer had a problem and pushed for a call or remote access.",
        "gift_card" to "A message asked for payment in gift cards.",
        "bank_impersonation" to "A message posing as a bank asked for account or card details.",
        "government_impersonation" to "A message posing as a government office demanded money or personal details.",
        "other" to "Tripwire saw several warning signs of a scam.",
    )

    fun scamType(result: CheckResult, who: CallWho?): String = when {
        Sign.GIFT_CARDS in result.signs -> "gift_card"
        Sign.REMOTE in result.signs -> "tech_support"
        who == CallWho.BANK -> "bank_impersonation"
        who == CallWho.GOVERNMENT -> "government_impersonation"
        else -> "other"
    }

    /** Eight digits, every value equally likely. */
    fun newCode(random: java.util.Random): String = String.format(java.util.Locale.ROOT, "%08d", random.nextInt(100_000_000))
}
