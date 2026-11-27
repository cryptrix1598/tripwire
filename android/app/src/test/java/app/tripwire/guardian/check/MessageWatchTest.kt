package app.tripwire.guardian.check

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MessageWatchTest {
    private val own = "app.tripwire.guardian"

    @Test fun looksAtTextAndChatApps() {
        assertTrue(MessageWatch.worthALook("com.google.android.apps.messaging", own, "Your account is locked. Reply with the code we sent you now."))
        assertTrue(MessageWatch.worthALook("com.whatsapp", own, "Hi Mom, I lost my phone, this is my new number. Can you send money?"))
    }

    @Test fun ignoresOtherAppsShortTextAndItself() {
        assertFalse(MessageWatch.worthALook("com.example.game", own, "Your account is locked. Reply with the code now."))
        assertFalse(MessageWatch.worthALook("com.whatsapp", own, "ok see you"))
        assertFalse(MessageWatch.worthALook(own, own, "That message looks like a scam. Do not reply."))
        assertFalse(MessageWatch.worthALook("com.whatsapp", own, null))
    }

    @Test fun ordinaryChatNeverReachesTheModel() {
        assertFalse(MessageWatch.hasASign("Lunch at noon on Sunday? Grandpa wants to try the new diner on Main."))
    }
}
