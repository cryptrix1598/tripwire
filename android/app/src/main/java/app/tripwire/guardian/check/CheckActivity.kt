package app.tripwire.guardian.check

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.tripwire.guardian.R
import app.tripwire.guardian.ui.TripwireTheme
import app.tripwire.guardian.ui.Tw
import kotlinx.coroutines.launch

/**
 * "Is this a scam?" for the person being protected. Opens from its own icon, or
 * from the share sheet: share a text message or an email to Tripwire.
 */
class CheckActivity : ComponentActivity() {
    private val model: CheckViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null && intent?.action == Intent.ACTION_SEND) {
            model.text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty().take(5000)
        }
        setContent { TripwireTheme { CheckScreen(model) } }
    }
}

enum class Mode { MESSAGE, CALL }

/** Kept across rotation and while the check runs: the person never loses what they typed or the answer. */
class CheckViewModel : ViewModel() {
    private val checker = ScamChecker()
    var mode by mutableStateOf(Mode.MESSAGE)
    var text by mutableStateOf("")
    var call by mutableStateOf(CallAnswers())
    var busy by mutableStateOf(false)
        private set
    var result by mutableStateOf<CheckResult?>(null)
        private set

    fun edited() { result = null }

    fun run() {
        result = null
        val answers = call.copy(notes = text)
        if (mode == Mode.CALL) CallCheck.instant(answers)?.let { result = it; return }
        val input = if (mode == Mode.CALL) CallCheck.describe(answers) else text
        busy = true
        viewModelScope.launch {
            result = try { checker.check(input) } finally { busy = false }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CheckScreen(m: CheckViewModel) {
    Column(
        Modifier.fillMaxSize().background(Tw.Ground).safeDrawingPadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.check_title), style = MaterialTheme.typography.headlineMedium, color = Tw.Ink, modifier = Modifier.semantics { heading() })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Choice(m.mode == Mode.MESSAGE, R.string.check_mode_message) { m.mode = Mode.MESSAGE; m.edited() }
            Choice(m.mode == Mode.CALL, R.string.check_mode_call) { m.mode = Mode.CALL; m.edited() }
        }
        if (m.mode == Mode.CALL) {
            Question(R.string.check_call_who)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CallWho.entries.forEach { w -> Choice(m.call.who == w, whoLabel(w)) { m.call = m.call.copy(who = if (m.call.who == w) null else w); m.edited() } }
            }
            Question(R.string.check_call_question)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CallWant.entries.forEach { w ->
                    Choice(w in m.call.wants, wantLabel(w)) {
                        m.call = m.call.copy(wants = if (w in m.call.wants) m.call.wants - w else m.call.wants + w); m.edited()
                    }
                }
            }
            Question(R.string.check_call_how)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CallHow.entries.forEach { h ->
                    Choice(h in m.call.how, howLabel(h)) { m.call = m.call.copy(how = if (h in m.call.how) m.call.how - h else m.call.how + h); m.edited() }
                }
            }
        }
        OutlinedTextField(
            value = m.text,
            onValueChange = { m.text = it.take(5000); m.edited() },
            label = { Text(stringResource(if (m.mode == Mode.CALL) R.string.check_call_notes else R.string.check_message_label)) },
            modifier = Modifier.fillMaxWidth().heightIn(min = if (m.mode == Mode.CALL) 80.dp else 160.dp),
            textStyle = MaterialTheme.typography.bodyLarge,
        )
        Button(
            onClick = m::run,
            enabled = !m.busy && (m.text.isNotBlank() || (m.mode == Mode.CALL && (m.call.wants.isNotEmpty() || m.call.who != null))),
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Tw.Deep),
        ) { Text(stringResource(if (m.busy) R.string.check_busy else R.string.check_go), fontSize = 20.sp) }
        m.result?.let { ResultCard(it, isCall = m.mode == Mode.CALL) }
    }
}

@Composable
private fun Question(text: Int) = Text(stringResource(text), style = MaterialTheme.typography.titleMedium, color = Tw.Ink)

@Composable
private fun Choice(selected: Boolean, label: Int, onClick: () -> Unit) =
    FilterChip(selected = selected, onClick = onClick, label = { Text(stringResource(label), fontSize = 18.sp) }, modifier = Modifier.heightIn(min = 48.dp))

@Composable
private fun ResultCard(r: CheckResult, isCall: Boolean) {
    var showSent by rememberSaveable { mutableStateOf(false) }
    val (title, body, tone) = when (r.verdict) {
        Verdict.HANG_UP -> Triple(if (isCall) R.string.check_hangup_title else R.string.check_stop_title, if (isCall) R.string.check_hangup_body else R.string.check_stop_body, Tw.Signal)
        Verdict.CAREFUL -> Triple(R.string.check_careful_title, if (isCall) R.string.check_careful_call_body else R.string.check_careful_body, Tw.Signal)
        Verdict.NO_SIGNS -> Triple(
            if (r.route == Route.NOT_CHECKED) R.string.check_nothing_title else R.string.check_ok_title,
            if (r.route == Route.NOT_CHECKED) R.string.check_nothing_body else R.string.check_ok_body,
            Tw.Ok,
        )
    }
    Column(
        Modifier.fillMaxWidth().background(Tw.Surface, RoundedCornerShape(16.dp)).padding(20.dp).semantics { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(12.dp).background(tone, CircleShape))
        Text(stringResource(title), style = MaterialTheme.typography.headlineSmall, color = Tw.Ink, modifier = Modifier.semantics { heading() })
        Text(stringResource(body), style = MaterialTheme.typography.bodyLarge, color = Tw.Text2)
        val reasons = r.reasons.ifEmpty { r.signs.map { stringResource(signLabel(it)) } }
        if (r.verdict != Verdict.NO_SIGNS) reasons.forEach { Text("• $it", style = MaterialTheme.typography.bodyLarge, color = Tw.Ink) }
        RouteLine(r)
        if (r.sent != null) {
            TextButton(onClick = { showSent = !showSent }) { Text(stringResource(if (showSent) R.string.check_sent_hide else R.string.check_sent_show), fontSize = 18.sp) }
            if (showSent) Text(r.sent, style = MaterialTheme.typography.bodyMedium, color = Tw.Text2, modifier = Modifier.background(Tw.LineSoft, RoundedCornerShape(8.dp)).padding(12.dp))
        }
    }
}

@Composable
private fun RouteLine(r: CheckResult) {
    val (dot: Color, text) = when {
        r.wrongSide -> Tw.DotCloud to R.string.check_route_wrong_side
        r.route == Route.ON_PHONE -> Tw.Ok to R.string.check_route_phone
        r.route == Route.REDACTED_CLOUD -> Tw.DotCloud to R.string.check_route_cloud
        r.route == Route.RULES -> Tw.DotNeutral to R.string.check_route_rules
        else -> Tw.DotNeutral to R.string.check_route_none
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.size(10.dp).background(dot, CircleShape))
        Text(stringResource(text), style = MaterialTheme.typography.bodyMedium, color = Tw.Text2)
    }
}

private fun whoLabel(w: CallWho) = when (w) {
    CallWho.BANK -> R.string.who_bank
    CallWho.GOVERNMENT -> R.string.who_government
    CallWho.COMPANY -> R.string.who_company
    CallWho.FAMILY -> R.string.who_family
    CallWho.OTHER -> R.string.who_other
}

private fun wantLabel(w: CallWant) = when (w) {
    CallWant.GIFT_CARDS -> R.string.want_gift_cards
    CallWant.CRYPTO -> R.string.want_crypto
    CallWant.CODE -> R.string.want_code
    CallWant.REMOTE -> R.string.want_remote
    CallWant.MOVE_MONEY -> R.string.want_move_money
    CallWant.DETAILS -> R.string.want_details
    CallWant.PAYMENT -> R.string.want_payment
    CallWant.NOTHING -> R.string.want_nothing
}

private fun howLabel(h: CallHow) = when (h) {
    CallHow.RUSHING -> R.string.how_rushing
    CallHow.SECRET -> R.string.how_secret
    CallHow.STAY_ON_LINE -> R.string.how_stay
    CallHow.PATIENT -> R.string.how_patient
}

private fun signLabel(s: Sign) = when (s) {
    Sign.GIFT_CARDS -> R.string.sign_gift_cards
    Sign.CRYPTO -> R.string.sign_crypto
    Sign.CODE -> R.string.sign_code
    Sign.REMOTE -> R.string.sign_remote
    Sign.DETAILS -> R.string.sign_details
    Sign.MOVE_MONEY -> R.string.sign_move_money
    Sign.URGENT -> R.string.sign_urgent
    Sign.SECRET -> R.string.sign_secret
    Sign.THREAT -> R.string.sign_threat
}
