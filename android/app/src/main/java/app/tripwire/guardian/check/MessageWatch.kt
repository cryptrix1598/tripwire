package app.tripwire.guardian.check

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.tripwire.guardian.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * The pure part of watching incoming texts: which notifications are messages worth a look.
 * Most of these scams start with a text ("your account is locked", "read me the code"), so the
 * protected person's phone can look at each new message the moment it arrives instead of
 * waiting to be asked.
 */
object MessageWatch {
    /** Text and chat apps whose notifications carry the message itself. */
    val MESSAGE_APPS = setOf(
        "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms",
        "com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "com.facebook.orca", "org.thoughtcrime.securesms",
    )

    /** A message notification from a chat app, long enough to judge, and not one of Tripwire's own. */
    fun worthALook(packageName: String, ownPackage: String, text: String?): Boolean =
        packageName != ownPackage && packageName in MESSAGE_APPS && (text?.trim()?.length ?: 0) >= 20

    /**
     * Whether to check at all: only a message with at least one built-in warning sign reaches the
     * on-device model, so ordinary chat costs nothing.
     */
    fun hasASign(text: String): Boolean = Rules.signs(text).isNotEmpty()

    /** A warning is shown for "be careful" and "hang up" answers, never for "no signs". */
    fun warns(result: CheckResult): Boolean = result.verdict != Verdict.NO_SIGNS

    /** The settings screen where the person turns this on (Android asks them, not the app). */
    fun settingsIntent(): Intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    fun isOn(context: Context): Boolean =
        NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
}

/**
 * Reads new message notifications on the phone and, when one shows a warning sign, asks Gemini Nano
 * ON THE PHONE whether it is a scam. Nothing is sent to the cloud from here and nothing is stored:
 * the text lives only for the length of the check. A scam gets its own notification telling the
 * person not to reply, call back or read out a code.
 */
class MessageWatchService : NotificationListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val checker by lazy { ScamChecker() }
    /** Hashes of messages checked in the last few minutes, so a re-posted notification is not checked twice. */
    private val recent = ArrayDeque<Int>()

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()
        if (!MessageWatch.worthALook(sbn.packageName, packageName, text) || text == null) return
        val key = text.hashCode()
        if (key in recent) return
        recent.addLast(key)
        while (recent.size > 50) recent.removeFirst()
        // Every new message is read by Gemini Nano on the phone (when it is ready), not only those the
        // keyword rules flag: quiet scams use none of the listed words. Nothing is sent to the cloud.
        scope.launch {
            val result = try {
                checker.check(text.take(4000), allowCloud = false)
            } catch (_: Exception) {
                return@launch
            }
            if (MessageWatch.warns(result)) warn(result)
        }
    }

    private fun warn(result: CheckResult) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.watch_channel), NotificationManager.IMPORTANCE_HIGH))
        val open = PendingIntent.getActivity(
            this, 1, Intent(this, CheckActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val title = getString(if (result.verdict == Verdict.HANG_UP) R.string.watch_title_scam else R.string.watch_title_careful)
        // The most specific reason first (written by the model on the phone), then the fixed advice.
        val body = result.reasons.firstOrNull()?.let { it + "\n\n" + getString(R.string.watch_body) } ?: getString(R.string.watch_body)
        val notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(result.reasons.firstOrNull() ?: getString(R.string.watch_body))
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        try {
            NotificationManagerCompat.from(this).notify(WARNING_ID, notification)
        } catch (_: SecurityException) {
            // Notifications were turned off for Tripwire.
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private companion object {
        const val CHANNEL = "tripwire_message_watch"
        const val WARNING_ID = 4242
    }
}
