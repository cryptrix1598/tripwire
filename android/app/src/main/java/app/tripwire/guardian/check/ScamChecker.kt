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

/** Which pinned model a call goes to. */
enum class ModelKind { PHONE, LISTER, CLOUD }

/** What one model call gave back. */
sealed interface Reply {
    data class Text(val text: String) : Reply
    /** A call meant for one side was answered by the other: final, never retried. */
    data object WrongSide : Reply
    data object Nothing : Reply
}

/** The model calls, behind an interface so the routing is unit tested without Firebase. */
interface ModelClient {
    suspend fun phoneReady(): Boolean
    suspend fun ask(kind: ModelKind, prompt: String): Reply
    suspend fun config(): CheckConfig = CheckConfig()
}

/**
 * The AI half of "Is this a scam?" on the phone: the routing.
 *   1. Gemini Nano on the phone (ONLY_ON_DEVICE) reads the text as it is.
 *   2. Only if the phone is unsure: redacted, listed by the phone, redacted again and
 *      leak-checked, then the cloud (ONLY_IN_CLOUD). Any failure on the way sends nothing.
 *   3. No phone model: the redacted cloud check. Offline: the built-in rules.
 */
class ScamChecker(private val client: ModelClient = FirebaseModelClient()) {
    private val language: String = Locale.getDefault().getDisplayLanguage(Locale.ENGLISH)
    private var config: CheckConfig? = null

    /** allowCloud = false (the automatic message watch): the phone's own model or the rules, nothing sent. */
    suspend fun check(text: String, allowCloud: Boolean = true): CheckResult {
        val c = config ?: client.config().also { config = it }
        val signs = Rules.signs(text)
        val rules = CheckResult(Rules.verdict(signs), Route.RULES, signs)
        val phone = client.phoneReady()
        if (phone) {
            when (val local = askParsed(ModelKind.PHONE, Answers.prompt(text, language), Answers::parse)) {
                is Reply.WrongSide -> return rules.copy(wrongSide = true)
                is Reply.Text -> {
                    val answer = Answers.parse(local.text) ?: return rules
                    Decide.onPhone(answer.risk, signs, c)?.let { return CheckResult(it, Route.ON_PHONE, signs, answer.reasons) }
                }
                // The phone was meant to look and could not: keep the answer on the phone.
                Reply.Nothing -> return rules
            }
        }
        if (!allowCloud) return rules
        return cloud(text, signs, phone, c) ?: rules
    }

    private suspend fun cloud(text: String, signs: List<Sign>, phone: Boolean, c: CheckConfig): CheckResult? {
        val first = Redactor.redact(text)
        var candidate = first.text
        var listedItems = emptyList<String>()
        if (phone) {
            val listed = askParsed(ModelKind.LISTER, Answers.listPrompt(candidate), Answers::parseItems)
            if (listed is Reply.WrongSide) return CheckResult(Rules.verdict(signs), Route.RULES, signs, wrongSide = true)
            listedItems = (listed as? Reply.Text)?.let { Answers.parseItems(it.text) } ?: return null
            candidate = Redactor.redact(Redactor.replaceItems(candidate, listedItems)).text
        }
        // Nothing the patterns removed, and nothing the phone listed, may still be there in any case.
        if (!Redactor.clean(candidate, first.found + Redactor.usable(listedItems))) return null
        val reply = askParsed(ModelKind.CLOUD, Answers.prompt(candidate, language), Answers::parseJson) as? Reply.Text ?: return null
        val answer = Answers.parseJson(reply.text) ?: return null
        return CheckResult(Decide.fromCloud(answer.risk, signs, c), Route.REDACTED_CLOUD, signs, answer.reasons, sent = candidate)
    }

    /** One call, retried once if the answer does not parse (never after a wrong-side answer or no answer). */
    private suspend fun askParsed(kind: ModelKind, prompt: String, parses: (String?) -> Any?): Reply {
        repeat(2) {
            val reply = client.ask(kind, prompt)
            if (reply !is Reply.Text || parses(reply.text) != null) return reply
        }
        return Reply.Nothing
    }
}

/** The real calls: Firebase AI Logic hybrid inference, mode pinned per model (firebase-ai 18.2.0). */
@OptIn(PublicPreviewAPI::class)
class FirebaseModelClient : ModelClient {
    private val ai by lazy { Firebase.ai(backend = GenerativeBackend.googleAI()) }
    private var model = CheckConfig().cloudModel
    private val phone by lazy { ai.generativeModel(modelName = model, onDeviceConfig = OnDeviceConfig(InferenceMode.ONLY_ON_DEVICE, 160, 0f)) }
    /** Listing personal details can need more room than a verdict, so it has its own output budget. */
    private val lister by lazy { ai.generativeModel(modelName = model, onDeviceConfig = OnDeviceConfig(InferenceMode.ONLY_ON_DEVICE, 512, 0f)) }
    /** The cloud answers to a schema, like the extension's cloud call. */
    private val cloud by lazy {
        ai.generativeModel(
            modelName = model,
            generationConfig = generationConfig {
                responseMimeType = "application/json"
                responseSchema = Schema.obj(mapOf("risk" to Schema.integer(), "reasons" to Schema.array(Schema.string())))
            },
            onDeviceConfig = OnDeviceConfig(InferenceMode.ONLY_IN_CLOUD),
        )
    }

    override suspend fun config(): CheckConfig = RemoteSettings.load().also { model = it.cloudModel }

    override suspend fun phoneReady(): Boolean = try {
        FirebaseAIOnDevice.checkStatus() == OnDeviceModelStatus.AVAILABLE
    } catch (_: Exception) {
        false
    }

    override suspend fun ask(kind: ModelKind, prompt: String): Reply = try {
        val (m, expected, timeout) = when (kind) {
            ModelKind.PHONE -> Triple(phone, InferenceSource.ON_DEVICE, 20_000L)
            ModelKind.LISTER -> Triple(lister, InferenceSource.ON_DEVICE, 20_000L)
            ModelKind.CLOUD -> Triple(cloud, InferenceSource.IN_CLOUD, 25_000L)
        }
        withTimeoutOrNull(timeout) {
            val response = m.generateContent(prompt)
            when {
                response.inferenceSource != expected -> Reply.WrongSide
                response.text.isNullOrBlank() -> Reply.Nothing
                else -> Reply.Text(response.text!!)
            }
        } ?: Reply.Nothing
    } catch (_: Exception) {
        Reply.Nothing
    }
}
