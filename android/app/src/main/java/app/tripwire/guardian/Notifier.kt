package app.tripwire.guardian

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/** Local notifications for new alerts. They carry the nickname and the outcome, nothing else. */
object Notifier {
    private const val CHANNEL = "tripwire_alerts"

    fun createChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL, context.getString(R.string.notif_channel), NotificationManager.IMPORTANCE_HIGH)
        channel.description = context.getString(R.string.notif_channel_description)
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    fun canNotify(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun alert(context: Context, person: Person, alert: Alert) {
        if (!canNotify(context)) return
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val name = person.nickname.ifBlank { context.getString(R.string.feed_someone) }
        val title = context.getString(if (alert.continued) R.string.notif_continued else R.string.notif_stopped, name)
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(context.getString(Labels.scam(alert.scamType)))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(alert.id.hashCode(), notification)
        } catch (_: SecurityException) {
            // Permission was withdrawn between the check and the call.
        }
    }
}

/** Fixed wording for the enums an alert can carry. Unknown values fall back to a neutral label. */
object Labels {
    fun scam(type: String): Int = when (type) {
        "tech_support" -> R.string.scam_tech_support
        "gift_card" -> R.string.scam_gift_card
        "bank_impersonation" -> R.string.scam_bank_impersonation
        "government_impersonation" -> R.string.scam_government_impersonation
        "delivery" -> R.string.scam_delivery
        "shopping_impersonation" -> R.string.scam_shopping_impersonation
        "investment_crypto" -> R.string.scam_investment_crypto
        "prize_lottery" -> R.string.scam_prize_lottery
        "romance" -> R.string.scam_romance
        "payment_request" -> R.string.scam_payment_request
        "phishing_login" -> R.string.scam_phishing_login
        "none" -> R.string.scam_none
        else -> R.string.scam_other
    }

    fun action(action: String): Int = when (action) {
        "card_entry" -> R.string.action_card_entry
        "remote_download" -> R.string.action_remote_download
        "phone_call" -> R.string.action_phone_call
        "gift_card" -> R.string.action_gift_card
        "crypto_wire" -> R.string.action_crypto_wire
        else -> R.string.action_passive
    }
}
