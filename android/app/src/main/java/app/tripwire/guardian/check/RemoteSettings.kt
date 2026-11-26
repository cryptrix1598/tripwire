package app.tripwire.guardian.check

import com.google.firebase.Firebase
import com.google.firebase.remoteconfig.remoteConfig
import com.google.firebase.remoteconfig.remoteConfigSettings
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

/** Reads `tripwire_config`, the same Remote Config parameter the extension uses. Never slows a check by more than 3 seconds. */
object RemoteSettings {
    private const val KEY = "tripwire_config"
    private const val TWELVE_HOURS = 12L * 60 * 60

    suspend fun load(): CheckConfig = try {
        val rc = Firebase.remoteConfig
        rc.setConfigSettingsAsync(remoteConfigSettings { minimumFetchIntervalInSeconds = TWELVE_HOURS }).await()
        withTimeoutOrNull(3_000) { rc.fetchAndActivate().await() }
        CheckConfig.parse(rc.getString(KEY))
    } catch (_: Exception) {
        CheckConfig()
    }
}
