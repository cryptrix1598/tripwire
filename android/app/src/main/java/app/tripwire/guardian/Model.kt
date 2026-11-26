package app.tripwire.guardian

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/** Someone the guardian looks out for. `deviceId` is the anonymous uid of their Tripwire extension. */
data class Person(val deviceId: String, val nickname: String)

/**
 * One alert, exactly as the extension wrote it: five fixed fields and nothing
 * else. The Firestore security rules reject anything more, so there is no page
 * or email text here to show even by accident.
 */
data class Alert(
    val id: String,
    val createdAtMillis: Long,
    val scamType: String,
    val summary: String,
    val action: String,
    val outcome: String,
) {
    val continued: Boolean get() = outcome == "continued"
}

object Pairing {
    /** The eight digits of a pairing code, or null if that is not what was typed. */
    fun cleanCode(input: String): String? {
        val digits = input.filter { it.isDigit() }
        return if (digits.length == 8 && input.all { it.isDigit() || it.isWhitespace() || it == '-' }) digits else null
    }

    fun cleanNickname(input: String): String = input.trim().take(40)
}

sealed interface DayLabel {
    data object Today : DayLabel
    data object Yesterday : DayLabel
    data class Earlier(val date: LocalDate) : DayLabel
}

fun dayLabel(thenMillis: Long, nowMillis: Long, zone: ZoneId): DayLabel {
    val then = Instant.ofEpochMilli(thenMillis).atZone(zone).toLocalDate()
    val now = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate()
    return when (ChronoUnit.DAYS.between(then, now)) {
        0L -> DayLabel.Today
        1L -> DayLabel.Yesterday
        else -> DayLabel.Earlier(then)
    }
}

/**
 * The prompt for "What should I say to them?". It is built only from the kind
 * of scam and whether they stopped, both plain labels, so nothing personal can
 * reach a model, on the phone or in the cloud.
 */
object AdvicePrompt {
    fun build(scamLabel: String, continued: Boolean): String = listOf(
        "You help a family member talk kindly with an older relative.",
        "A scam-protection tool on the relative's computer just stepped in.",
        "Kind of scam: $scamLabel.",
        if (continued) "What happened: they saw the warning and continued anyway." else "What happened: they saw the warning and stopped.",
        "Write three short sentences the family member could say on a phone call today.",
        "Be warm. Never blame or lecture. Never ask for passwords, card numbers or account numbers.",
        if (continued) {
            "Gently suggest checking with the real bank or company together, using a phone number they already have."
        } else {
            "Praise them for stopping, and remind them a real company will always let them take their time."
        },
        "Plain text only. No lists, no headings, no quotation marks.",
    ).joinToString("\n")
}
