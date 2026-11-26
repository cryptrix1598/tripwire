package app.tripwire.guardian

import com.google.firebase.Firebase
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.ondevice.DownloadStatus
import com.google.firebase.ai.ondevice.FirebaseAIOnDevice
import com.google.firebase.ai.ondevice.OnDeviceModelStatus
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * The app's only AI call, and it goes through Firebase AI Logic hybrid inference.
 *
 * API checked against the docs and the library itself on 2026-11-14:
 *   https://firebase.google.com/docs/ai-logic/hybrid/android/get-started
 *   https://firebase.google.com/docs/ai-logic/hybrid/android/configuration-options
 *   firebase-ai 18.2.0 and firebase-ai-ondevice 16.0.0-beta08 (experimental, opt-in)
 *
 * PREFER_ON_DEVICE: Gemini Nano on the phone when it is there, the cloud model
 * otherwise. `response.inferenceSource` says which one answered, and the app
 * shows that under every suggestion.
 */
@OptIn(PublicPreviewAPI::class)
class AdviceWriter {

    enum class Route { ON_DEVICE, IN_CLOUD }
    data class Advice(val text: String, val route: Route)
    enum class ModelState { UNKNOWN, AVAILABLE, DOWNLOADABLE, DOWNLOADING, UNAVAILABLE }

    private val model by lazy {
        Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
            modelName = CLOUD_MODEL,
            onDeviceConfig = OnDeviceConfig(mode = InferenceMode.PREFER_ON_DEVICE, maxOutputTokens = 220),
        )
    }

    /** Throws if neither the phone nor the cloud could answer. */
    suspend fun write(scamLabel: String, continued: Boolean): Advice {
        val response = model.generateContent(AdvicePrompt.build(scamLabel, continued, java.util.Locale.getDefault().getDisplayLanguage(java.util.Locale.ENGLISH)))
        val text = response.text?.trim().orEmpty()
        check(text.isNotEmpty()) { "The model returned no text" }
        val route = if (response.inferenceSource == InferenceSource.ON_DEVICE) Route.ON_DEVICE else Route.IN_CLOUD
        return Advice(text, route)
    }

    suspend fun modelState(): ModelState = try {
        when (FirebaseAIOnDevice.checkStatus()) {
            OnDeviceModelStatus.AVAILABLE -> ModelState.AVAILABLE
            OnDeviceModelStatus.DOWNLOADABLE -> ModelState.DOWNLOADABLE
            OnDeviceModelStatus.DOWNLOADING -> ModelState.DOWNLOADING
            else -> ModelState.UNAVAILABLE
        }
    } catch (_: Exception) {
        ModelState.UNAVAILABLE
    }

    /** The one-time on-device model download. Emits true when it has finished, false if it failed. */
    fun download(): Flow<Boolean?> = FirebaseAIOnDevice.download().map { status ->
        when (status) {
            is DownloadStatus.DownloadCompleted -> true
            is DownloadStatus.DownloadFailed -> false
            else -> null
        }
    }

    private companion object {
        /** Same cloud model as the extension. */
        const val CLOUD_MODEL = "gemini-3.5-flash-lite"
    }
}
