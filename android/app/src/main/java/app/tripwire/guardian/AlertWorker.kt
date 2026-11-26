package app.tripwire.guardian

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Alerts while the app is closed. Every 15 minutes (the shortest period Android
 * allows), with a network, Android wakes this worker: it reads each linked
 * person's alerts newer than the last one it saw and posts a notification for
 * each new one. No server and no paid plan; the same security rules apply, so it
 * can only ever read the five fixed fields.
 *
 * Notifications use the alert's ID, so an alert the open app already showed is
 * not shown twice.
 */
class AlertWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = try {
        val repo = GuardianRepository()
        val uid = repo.signIn()
        val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        for (person in repo.peopleOnce(uid)) {
            val key = "lastSeen:${person.deviceId}"
            val since = prefs.getLong(key, -1L)
            if (since < 0) {
                // First run for this person: start from now rather than replaying old alerts.
                prefs.edit().putLong(key, System.currentTimeMillis()).apply()
                continue
            }
            val fresh = try {
                repo.alertsSince(person.deviceId, since)
            } catch (_: Exception) {
                // Not allowed yet (the person has not tapped "Yes, allow"), or offline: try next time.
                continue
            }
            fresh.forEach { Notifier.alert(applicationContext, person, it) }
            fresh.maxOfOrNull { it.createdAtMillis }?.let { prefs.edit().putLong(key, it).apply() }
        }
        Result.success()
    } catch (_: Exception) {
        Result.retry()
    }

    companion object {
        private const val PREFS = "alert-worker"
        private const val NAME = "tripwire-alerts"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<AlertWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
