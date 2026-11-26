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
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.generationConfig
import java.util.Locale
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
    /** Listing personal details can need more room than a verdict, so it has its own output budget. */
    private val lister by lazy {
        ai.generativeModel(modelName = CLOUD_MODEL, onDeviceConfig = OnDeviceConfig(InferenceMode.ONLY_ON_DEVICE, 512, 0f))
    }
    /** The cloud answers to a schema, like the extension's cloud call. */
    private val inCloud by lazy {
        ai.generativeModel(
            modelName = CLOUD_MODEL,
            generationConfig = generationConfig {
                responseMimeType = "application/json"
                responseSchema = Schema.obj(mapOf("risk" to Schema.integer(), "reasons" to Schema.array(Schema.string())))
            },
            onDeviceConfig = OnDeviceConfig(InferenceMode.ONLY_IN_CLOUD),
        )
    }
    /** Reasons are written in the phone's language (English, Spanish or French screens). */
    private val language: String = Locale.getDefault().getDisplayLanguage(Locale.ENGLISH)

    suspend fun check(text: String): CheckResult {
        val signs = Rules.signs(text)
        val rules = CheckResult(Rules.verdict(signs), Route.RULES, signs)

        val phone = phoneModelReady()
        if (phone) {
            val local = ask(onPhone, Answers.prompt(text, language), InferenceSource.ON_DEVICE, ON_PHONE_MS, Answers::parse)
            when {
                local is Reply.WrongSide -> return rules.copy(wrongSide = true)
                local is Reply.Text -> {
                    val answer = Answers.parse(local.text) ?: return rules
                    Decide.onPhone(answer.risk, signs)?.let { return CheckResult(it, Route.ON_PHONE, signs, answer.reasons) }
                }
                // The phone was meant to look and could not: keep the answer on the phone.
                else -> return rules
            }
        }
        return when (val c = cloud(text, signs, phone)) {
            null -> rules
            else -> c
        }
    }

    /**
     * Redact, then (when the phone has a model) let it point at what the patterns missed, then
     * redact again and check for leaks. Any failure on the way means nothing is sent.
     */
    private suspend fun cloud(text: String, signs: List<Sign>, phone: Boolean): CheckResult? {
        val first = Redactor.redact(text)
        var candidate = first.text
        var listedItems = emptyList<String>()
        if (phone) {
            val listed = ask(lister, Answers.listPrompt(candidate), InferenceSource.ON_DEVICE, ON_PHONE_MS, Answers::parseItems)
            if (listed is Reply.WrongSide) return CheckResult(Rules.verdict(signs), Route.RULES, signs, wrongSide = true)
            listedItems = (listed as? Reply.Text)?.let { Answers.parseItems(it.text) } ?: return null
            candidate = Redactor.redact(Redactor.replaceItems(candidate, listedItems)).text
        }
        // Nothing the patterns removed, and nothing the phone listed, may still be there in any case.
        if (!Redactor.clean(candidate, first.found + Redactor.usable(listedItems))) return null
        val reply = ask(inCloud, Answers.prompt(candidate, language), InferenceSource.IN_CLOUD, IN_CLOUD_MS, Answers::parseJson) as? Reply.Text ?: return null
        val answer = Answers.parseJson(reply.text) ?: return null
        return CheckResult(Decide.fromCloud(answer.risk, signs), Route.REDACTED_CLOUD, signs, answer.reasons, sent = candidate)
    }

    private sealed interface Reply {
        data class Text(val text: String) : Reply
        data object WrongSide : Reply
        data object Nothing : Reply
    }

    /** One call, retried once if the answer does not parse (never after a timeout or a wrong-side answer). */
    private suspend fun ask(
        model: com.google.firebase.ai.GenerativeModel,
        prompt: String,
        expected: InferenceSource,
        timeoutMs: Long,
        parses: (String?) -> Any?,
    ): Reply {
        repeat(2) {
            val reply = try {
                withTimeoutOrNull(timeoutMs) {
                    val response = model.generateContent(prompt)
                    when {
                        response.inferenceSource != expected -> Reply.WrongSide
                        response.text.isNullOrBlank() -> Reply.Nothing
                        else -> Reply.Text(response.text!!)
                    }
                } ?: return Reply.Nothing
            } catch (_: Exception) {
                Reply.Nothing
            }
            if (reply is Reply.WrongSide || (reply is Reply.Text && parses(reply.text) != null)) return reply
        }
        return Reply.Nothing
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
