package app.tripwire.guardian

import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelTest {
    private val zone = ZoneId.of("America/Los_Angeles")
    private fun at(day: Int, hour: Int) = ZonedDateTime.of(2026, 11, day, hour, 0, 0, 0, zone).toInstant().toEpochMilli()

    @Test
    fun `pairing code accepts eight digits with spaces or a dash`() {
        assertEquals("48291375", Pairing.cleanCode("48291375"))
        assertEquals("48291375", Pairing.cleanCode("4829 1375"))
        assertEquals("48291375", Pairing.cleanCode(" 4829-1375 "))
    }

    @Test
    fun `pairing code rejects anything else`() {
        assertNull(Pairing.cleanCode(""))
        assertNull(Pairing.cleanCode("482913"))
        assertNull(Pairing.cleanCode("482913751"))
        assertNull(Pairing.cleanCode("4829137a"))
        assertNull(Pairing.cleanCode("48291375; drop"))
    }

    @Test
    fun `nickname is trimmed and capped at the length the security rules allow`() {
        assertEquals("Mum", Pairing.cleanNickname("  Mum  "))
        assertEquals(40, Pairing.cleanNickname("x".repeat(90)).length)
    }

    @Test
    fun `day label follows the calendar day in the guardian's time zone`() {
        assertEquals(DayLabel.Today, dayLabel(at(14, 1), at(14, 23), zone))
        assertEquals(DayLabel.Yesterday, dayLabel(at(13, 23), at(14, 0), zone))
        assertEquals(DayLabel.Earlier(LocalDate.of(2026, 11, 9)), dayLabel(at(9, 12), at(14, 12), zone))
    }

    @Test
    fun `alert knows whether they continued`() {
        val alert = Alert("a", 0, "gift_card", "A message asked for payment in gift cards.", "gift_card", "continued")
        assertTrue(alert.continued)
        assertFalse(alert.copy(outcome = "stopped").continued)
    }

    @Test
    fun `advice prompt carries only the kind of scam and the outcome`() {
        val stopped = AdvicePrompt.build("Fake bank message", continued = false)
        val continued = AdvicePrompt.build("Fake bank message", continued = true)
        assertTrue(stopped.contains("Kind of scam: Fake bank message."))
        assertTrue(stopped.contains("they saw the warning and stopped"))
        assertTrue(continued.contains("continued anyway"))
        assertTrue(continued.contains("Never ask for passwords"))
        assertFalse(stopped == continued)
    }
}
