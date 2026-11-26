package app.tripwire.guardian.check

import com.google.firebase.Firebase
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.ondevice.FirebaseAIOnDevice
import com.google.firebase.ai.ondevice.OnDeviceModelStatus
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import kotlinx.coroutines.withTimeoutOrNull

/**
 * The AI half of "Is this a scam?" on the phone. Firebase AI Logic hybrid
 * inference, with the mode pinned per call (API checked against
 * firebase-ai 18.2.0 and firebase-ai-ondevice 16.0.0-beta08 on 2026-11-26):
 *
 *   1. Gemini Nano on the phone, ONLY_ON_DEVICE, reads the text as it is.
 *      `inferenceSource` must say ON_DEVICE, or Tripwire stops.
 *   2. Only if the phone is unsure: the redacted text, after a leak check that
 *      fails closed, goes to the cloud model with ONLY_IN_CLOUD.
 *   3. No phone model: the redacted cloud check. Offline: the built-in rules.
 */
@OptIn(PublicPreviewAPI::class)
class ScamChecker {
    private val ai by lazy { Firebase.ai(backend = GenerativeBackend.googleAI()) }
    private val onPhone by lazy {
        ai.generativeModel(modelName = CLOUD_MODEL, onDeviceConfig = OnDeviceConfig(InferenceMode.ONLY_ON_DEVICE, 160, 0f))
    }
    private val inCloud by lazy {
        ai.generativeModel(modelName = CLOUD_MODEL, onDeviceConfig = OnDeviceConfig(InferenceMode.ONLY_IN_CLOUD))
    }

    suspend fun check(text: String): CheckResult {
        val signs = Rules.signs(text)
        val rules = CheckResult(Rules.verdict(signs), Route.RULES, signs)

        if (phoneModelReady()) {
            val local = ask(onPhone, text, ON_PHONE_MS)
            when {
                local is Reply.WrongSide -> return rules.copy(wrongSide = true)
                local is Reply.Answer -> Decide.onPhone(local.answer.risk, signs)?.let {
                    return CheckResult(it, Route.ON_PHONE, signs, local.answer.reasons)
                }
                // The phone was meant to look and could not: keep the answer on the phone.
                else -> return rules
            }
        }
        return cloud(text, signs) ?: rules
    }

    private suspend fun cloud(text: String, signs: List<Sign>): CheckResult? {
        val redacted = Redactor.redact(text)
        if (!Redactor.clean(redacted)) return null
        val reply = ask(inCloud, redacted, IN_CLOUD_MS) as? Reply.Answer ?: return null
        return CheckResult(Decide.fromCloud(reply.answer.risk, signs), Route.REDACTED_CLOUD, signs, reply.answer.reasons, sent = redacted)
    }

    private sealed interface Reply {
        data class Answer(val answer: ModelAnswer) : Reply
        data object WrongSide : Reply
        data object Nothing : Reply
    }

    private suspend fun ask(model: com.google.firebase.ai.GenerativeModel, text: String, timeoutMs: Long): Reply = try {
        withTimeoutOrNull(timeoutMs) {
            val response = model.generateContent(Answers.prompt(text))
            val expected = if (model === onPhone) InferenceSource.ON_DEVICE else InferenceSource.IN_CLOUD
            if (response.inferenceSource != expected) Reply.WrongSide
            else Answers.parse(response.text)?.let { Reply.Answer(it) } ?: Reply.Nothing
        } ?: Reply.Nothing
    } catch (_: Exception) {
        Reply.Nothing
    }

    private suspend fun phoneModelReady(): Boolean = try {
        FirebaseAIOnDevice.checkStatus() == OnDeviceModelStatus.AVAILABLE
    } catch (_: Exception) {
        false
    }

    private companion object {
        const val CLOUD_MODEL = "gemini-3.5-flash-lite"
        const val ON_PHONE_MS = 20_000L
        const val IN_CLOUD_MS = 25_000L
    }
}
