package app.tripwire.guardian.check

import java.io.File
import java.util.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FamilyAlertsTest {
    @Test
    fun `every alert sentence the phone can send is the one firestore rules require`() {
        val rules = File("../../firestore.rules").readText()
        for ((type, sentence) in FamilyAlerts.SUMMARY) {
            assertTrue("$type does not match firestore.rules", rules.contains("'$type': '$sentence'"))
        }
    }

    @Test
    fun `the kind of scam is named from what the caller wanted and who they said they were`() {
        fun r(vararg s: Sign) = CheckResult(Verdict.HANG_UP, Route.RULES, s.toList())
        assertEquals("gift_card", FamilyAlerts.scamType(r(Sign.GIFT_CARDS), CallWho.BANK))
        assertEquals("tech_support", FamilyAlerts.scamType(r(Sign.REMOTE), null))
        assertEquals("bank_impersonation", FamilyAlerts.scamType(r(Sign.CODE), CallWho.BANK))
        assertEquals("government_impersonation", FamilyAlerts.scamType(r(Sign.THREAT), CallWho.GOVERNMENT))
        assertEquals("other", FamilyAlerts.scamType(r(Sign.CRYPTO), CallWho.FAMILY))
    }

    @Test
    fun `pairing codes are eight digits`() {
        val random = Random(1)
        repeat(200) { assertTrue(Regex("^\\d{8}$").matches(FamilyAlerts.newCode(random))) }
    }
}
