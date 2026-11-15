package app.tripwire.guardian

import com.google.firebase.Firebase
import com.google.firebase.appcheck.appCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory

/**
 * Debug builds: the App Check debug provider. Its token comes from the
 * `firebase_app_check_debug_token` string resource, which the build fills in
 * from local.properties (never committed).
 */
fun installAppCheck() {
    Firebase.appCheck.installAppCheckProviderFactory(DebugAppCheckProviderFactory.getInstance())
}
