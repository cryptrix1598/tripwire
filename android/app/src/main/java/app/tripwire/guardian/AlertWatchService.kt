package app.tripwire.guardian

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch

/**
 * Instant alerts, if the family member turns them on. A foreground service keeps
 * a live Firestore listener open, so an alert arrives within seconds even while
 * the app is closed, at the cost of a small, silent "Watching for alerts"
 * notification. Off by default; the 15-minute AlertWorker covers everyone else.
 * No server and no push: the same security rules, the same five fixed fields.
 */
class AlertWatchService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onBind(intent: Intent?): IBinder? = null

    @OptIn(ExperimentalCoroutinesApi::class)
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startWatching()
        scope.coroutineContext[kotlinx.coroutines.Job]?.children?.forEach { it.cancel() }
        val repo = GuardianRepository()
        scope.launch {
            val uid = runCatching { repo.signIn() }.getOrElse { stopSelf(); return@launch }
            val seen = mutableMapOf<String, MutableSet<String>>()
            repo.people(uid)
                .flatMapLatest { people ->
                    merge(*people.map { p -> repo.alertsOnceAllowed(p.deviceId).map { p to it } }.toTypedArray())
                }
                .onEach { (person, alerts) ->
                    val known = seen[person.deviceId]
                    // The first snapshot is history: only alerts that arrive after it are new.
                    if (known != null) alerts.filter { it.id !in known }.forEach { Notifier.alert(this@AlertWatchService, person, it) }
                    seen[person.deviceId] = alerts.map { it.id }.toMutableSet()
                }
                .catch { /* Offline or not allowed yet: the 15-minute worker still runs. */ }
                .launchIn(this)
        }
        return START_STICKY
    }

    private fun startWatching() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(WATCH_CHANNEL, getString(R.string.watch_channel), NotificationManager.IMPORTANCE_MIN),
        )
        val notification = NotificationCompat.Builder(this, WATCH_CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.watch_running))
            .setOngoing(true)
            .setSilent(true)
            .build()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        ServiceCompat.startForeground(this, WATCH_ID, notification, type)
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val WATCH_CHANNEL = "tripwire-watch"
        private const val WATCH_ID = 7341
        private const val PREFS = "instant-alerts"

        fun isOn(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("on", false)

        fun set(context: Context, on: Boolean) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("on", on).apply()
            val intent = Intent(context, AlertWatchService::class.java)
            if (on) ContextCompat.startForegroundService(context, intent) else context.stopService(intent)
        }

        /** Started again when the app opens, if it was on. */
        fun resume(context: Context) {
            if (isOn(context)) runCatching { ContextCompat.startForegroundService(context, Intent(context, AlertWatchService::class.java)) }
        }
    }
}
