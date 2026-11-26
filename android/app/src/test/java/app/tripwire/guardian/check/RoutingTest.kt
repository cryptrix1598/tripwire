package app.tripwire.guardian.check

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The phone's routing, with fake model calls: what is sent, and when nothing is. */
class RoutingTest {
    private val scam = "Hi Margaret, your account is locked. Buy gift cards today and read me the codes. Don't tell anyone."

    private class Fake(val phone: Boolean, val answers: Map<ModelKind, Reply>) : ModelClient {
        val calls = mutableListOf<Pair<ModelKind, String>>()
        override suspend fun phoneReady() = phone
        override suspend fun ask(kind: ModelKind, prompt: String): Reply {
            calls += kind to prompt
            return answers[kind] ?: Reply.Nothing
        }
    }

    private fun run(fake: Fake) = runBlocking { ScamChecker(fake).check(scam) }

    @Test
    fun `a sure phone answers alone and nothing is sent`() {
        val fake = Fake(true, mapOf(ModelKind.PHONE to Reply.Text("RISK: 95\nREASONS: Gift cards.")))
        val r = run(fake)
        assertEquals(Route.ON_PHONE, r.route)
        assertTrue(fake.calls.none { it.first == ModelKind.CLOUD })
    }

    @Test
    fun `a wrong-side answer stops at once and is never retried`() {
        val fake = Fake(true, mapOf(ModelKind.PHONE to Reply.WrongSide))
        val r = run(fake)
        assertTrue(r.wrongSide)
        assertEquals(1, fake.calls.size)
    }

    @Test
    fun `if the phone cannot list the details, nothing is sent`() {
        val fake = Fake(true, mapOf(ModelKind.PHONE to Reply.Text("RISK: 50\nREASONS: Unsure."), ModelKind.LISTER to Reply.Text("I am not sure.")))
        val r = run(fake)
        assertTrue(fake.calls.none { it.first == ModelKind.CLOUD })
        assertEquals(Route.RULES, r.route)
        assertNull(r.sent)
    }

    @Test
    fun `a phone that times out keeps the answer on the phone`() {
        val fake = Fake(true, emptyMap())
        val r = run(fake)
        assertEquals(Route.RULES, r.route)
        assertTrue(fake.calls.none { it.first == ModelKind.CLOUD })
    }

    @Test
    fun `an unsure phone sends only the redacted text, and the receipt is exactly that`() {
        val fake = Fake(true, mapOf(
            ModelKind.PHONE to Reply.Text("RISK: 50\nREASONS: Unsure."),
            ModelKind.LISTER to Reply.Text("NONE"),
            ModelKind.CLOUD to Reply.Text("""{"risk": 90, "reasons": ["It asks for gift cards."]}"""),
        ))
        val r = run(fake)
        val sent = fake.calls.first { it.first == ModelKind.CLOUD }.second
        assertFalse(sent.contains("Margaret"))
        assertEquals(Route.REDACTED_CLOUD, r.route)
        assertEquals(Verdict.HANG_UP, r.verdict)
        assertTrue(sent.contains(r.sent!!))
    }

    @Test
    fun `an unreadable answer is retried once`() {
        val fake = Fake(false, mapOf(ModelKind.CLOUD to Reply.Text("not json")))
        run(fake)
        assertEquals(2, fake.calls.count { it.first == ModelKind.CLOUD })
    }
}
