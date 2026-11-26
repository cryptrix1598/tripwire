package app.tripwire.guardian

import android.Manifest
import android.app.Application
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.tripwire.guardian.ui.GuardianScreen
import app.tripwire.guardian.ui.TripwireTheme
import com.google.firebase.Firebase
import com.google.firebase.initialize

class GuardianApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Firebase.initialize(context = this)
        // App Check must be installed before the first Firestore or AI Logic call.
        installAppCheck()
        Notifier.createChannel(this)
        // Alerts while the app is closed, about every 15 minutes.
        AlertWorker.schedule(this)
    }
}

class MainActivity : ComponentActivity() {
    private val viewModel: GuardianViewModel by viewModels()
    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !Notifier.canNotify(this)) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        setContent {
            val state by viewModel.state.collectAsStateWithLifecycle()
            TripwireTheme {
                GuardianScreen(
                    state = state,
                    onRetry = viewModel::start,
                    onSelect = viewModel::select,
                    onShowPairing = viewModel::showPairing,
                    onPair = viewModel::pair,
                    onAdvice = viewModel::writeAdvice,
                    onDownloadModel = viewModel::downloadModel,
                )
            }
        }
    }
}
