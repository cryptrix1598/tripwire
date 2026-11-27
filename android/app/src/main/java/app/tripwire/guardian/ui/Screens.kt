package app.tripwire.guardian.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.tripwire.guardian.AdviceState
import app.tripwire.guardian.AdviceWriter
import app.tripwire.guardian.Alert
import app.tripwire.guardian.DayLabel
import app.tripwire.guardian.Hold
import app.tripwire.guardian.Labels
import app.tripwire.guardian.PairError
import app.tripwire.guardian.Person
import app.tripwire.guardian.R
import app.tripwire.guardian.UiState
import app.tripwire.guardian.dayLabel
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Design: the guardian's question is "is the person I care about OK?". The feed
 * answers it in rows they can scan: when, what kind, what happened. The alert
 * that needs a phone call differs by color, icon and wording, never color
 * alone. Every AI suggestion says where it was written.
 */

private val TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
private val DATE = DateTimeFormatter.ofPattern("MMM d", Locale.US)

@Composable
fun GuardianScreen(
    state: UiState,
    onRetry: () -> Unit,
    onSelect: (String) -> Unit,
    onShowPairing: (Boolean) -> Unit,
    onPair: (code: String, nickname: String, fallbackName: String) -> Unit,
    onAdvice: (alert: Alert, scamLabel: String, fixed: String) -> Unit,
    onDownloadModel: () -> Unit,
    onAnswerHold: (Boolean) -> Unit,
) {
    Column(Modifier.fillMaxSize().background(Tw.Ground)) {
        Row(
            Modifier.fillMaxWidth().background(Tw.Deep).statusBarsPadding().padding(horizontal = 24.dp, vertical = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Mark(28.dp, Tw.Signal)
            Text(stringResource(R.string.app_name), color = Tw.OnDeep, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        Box(Modifier.weight(1f).fillMaxWidth().navigationBarsPadding().imePadding()) {
            when {
                state.starting -> Text(stringResource(R.string.feed_loading), Modifier.padding(24.dp), color = Tw.Text2)
                state.startFailed -> Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    Notice(stringResource(R.string.start_error))
                    PrimaryButton(stringResource(R.string.retry), onClick = onRetry)
                }
                state.showPairing -> PairScreen(state, onPair, onBack = { onShowPairing(false) })
                else -> FeedScreen(state, onSelect, onAdd = { onShowPairing(true) }, onAdvice, onDownloadModel, onAnswerHold)
            }
        }
    }
}

@Composable
private fun PairScreen(state: UiState, onPair: (String, String, String) -> Unit, onBack: () -> Unit) {
    var code by rememberSaveable { mutableStateOf("") }
    var nickname by rememberSaveable { mutableStateOf("") }
    val fallbackName = stringResource(R.string.feed_someone)
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Text(stringResource(R.string.pair_title), style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.pair_body), color = Tw.Text2)
        OutlinedTextField(
            value = code,
            onValueChange = { code = it.take(7) },
            label = { Text(stringResource(R.string.pair_code_label)) },
            placeholder = { Text("000000", fontSize = 32.sp, fontWeight = FontWeight.Bold) },
            textStyle = TextStyle(fontSize = 32.sp, fontWeight = FontWeight.Bold, letterSpacing = 4.sp, color = Tw.Ink),
            singleLine = true,
            isError = state.pairError != null,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = nickname,
            onValueChange = { nickname = it.take(40) },
            label = { Text(stringResource(R.string.pair_name_label)) },
            placeholder = { Text(stringResource(R.string.pair_name_placeholder)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        state.pairError?.let { error ->
            Notice(
                stringResource(
                    when (error) {
                        PairError.FORMAT -> R.string.pair_error_format
                        PairError.NOT_FOUND -> R.string.pair_error_not_found
                        PairError.FAILED -> R.string.pair_error_generic
                    },
                ),
            )
        }
        PrimaryButton(
            stringResource(if (state.pairBusy) R.string.pair_working else R.string.pair_submit),
            enabled = !state.pairBusy,
            onClick = { onPair(code, nickname, fallbackName) },
        )
        if (state.people.isNotEmpty()) QuietButton(stringResource(R.string.pair_cancel), onBack)

        HorizontalDivider(thickness = 4.dp, color = Tw.Deep)
        Text(stringResource(R.string.see_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
        SeeList(R.string.see_yes, listOf(R.string.see_yes_1, R.string.see_yes_2, R.string.see_yes_3), ok = true)
        SeeList(R.string.see_no, listOf(R.string.see_no_1, R.string.see_no_2, R.string.see_no_3), ok = false)
    }
}

@Composable
private fun SeeList(title: Int, items: List<Int>, ok: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(stringResource(title), style = MaterialTheme.typography.titleMedium, color = if (ok) Tw.Ok else Tw.Text2)
        items.forEach { item ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TickOrCross(ok, Modifier.padding(top = 3.dp))
                Text(stringResource(item))
            }
        }
    }
}

@Composable
private fun FeedScreen(
    state: UiState,
    onSelect: (String) -> Unit,
    onAdd: () -> Unit,
    onAdvice: (Alert, String, String) -> Unit,
    onDownloadModel: () -> Unit,
    onAnswerHold: (Boolean) -> Unit,
) {
    val person = state.selected ?: return
    val alerts = state.alerts
    LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (state.people.size > 1) {
            item(key = "people") { PeopleRow(state.people, person, onSelect) }
        }
        item(key = "title") {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    person.nickname.ifBlank { stringResource(R.string.feed_someone) },
                    style = MaterialTheme.typography.headlineLarge,
                    modifier = Modifier.semantics { heading() },
                )
                Text(stringResource(R.string.feed_subtitle), color = Tw.Text2)
                if (alerts != null && !state.alertsFailed) {
                    DotLine(Tw.Ok, stringResource(R.string.feed_live), bold = true, color = Tw.Ok)
                }
            }
        }
        state.hold?.let { hold ->
            val now = System.currentTimeMillis()
            if (hold.running(now) || hold.answeredRecently(now)) {
                item(key = "hold") { HoldCard(hold, now, state.holdBusy, state.holdFailed, onAnswerHold) }
            }
        }
        when {
            state.alertsFailed -> item(key = "error") { Notice(stringResource(R.string.feed_load_error)) }
            alerts == null -> item(key = "loading") { Text(stringResource(R.string.feed_loading), color = Tw.Text2) }
            alerts.isEmpty() -> item(key = "empty") {
                Surface(shape = RoundedCornerShape(16.dp), color = Tw.Surface, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(28.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.feed_empty_title), style = MaterialTheme.typography.headlineSmall)
                        Text(stringResource(R.string.feed_empty_body), color = Tw.Text2)
                    }
                }
            }
            else -> items(alerts, key = { it.id }) { alert -> AlertCard(alert, state.advice[alert.id], onAdvice) }
        }
        item(key = "instant") { InstantAlerts() }
        item(key = "model") { ModelStatus(state.model, onDownloadModel) }
        item(key = "privacy") { Text(stringResource(R.string.feed_privacy), style = MaterialTheme.typography.bodyMedium, color = Tw.Text2) }
        item(key = "add") {
            OutlinedButton(onClick = onAdd, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp), shape = RoundedCornerShape(14.dp)) {
                Text(stringResource(R.string.feed_add_another), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

/**
 * A hold running on their computer. Answered once: keep it on hold (the safe default, first), or let it
 * go through after talking to them. The security rules allow only these two answers, only while it runs.
 */
@Composable
private fun HoldCard(hold: Hold, now: Long, busy: Boolean, failed: Boolean, onAnswer: (Boolean) -> Unit) {
    Surface(shape = RoundedCornerShape(16.dp), color = Tw.SignalSoft, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!hold.running(now)) {
                Text(
                    stringResource(if (hold.decision == "released") R.string.hold_released else R.string.hold_extended),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                return@Column
            }
            Text(stringResource(R.string.hold_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
            val until = TIME.format(Instant.ofEpochMilli(hold.endsAtMillis).atZone(ZoneId.systemDefault()))
            Text(stringResource(R.string.hold_body, stringResource(Labels.action(hold.action)), until))
            Text(stringResource(R.string.hold_advice), color = Tw.Text2)
            PrimaryButton(stringResource(R.string.hold_extend), enabled = !busy) { onAnswer(false) }
            OutlinedButton(
                onClick = { onAnswer(true) },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                shape = RoundedCornerShape(12.dp),
            ) { Text(stringResource(R.string.hold_release), style = MaterialTheme.typography.labelLarge) }
            if (failed) Notice(stringResource(R.string.hold_failed))
        }
    }
}

/** Opt-in: alerts within seconds while the app is closed, with a small ongoing notification. */
@Composable
private fun InstantAlerts() {
    val context = androidx.compose.ui.platform.LocalContext.current
    var on by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(app.tripwire.guardian.AlertWatchService.isOn(context)) }
    Surface(shape = RoundedCornerShape(16.dp), color = Tw.Surface, modifier = Modifier.fillMaxWidth()) {
        androidx.compose.foundation.layout.Row(
            Modifier.padding(20.dp),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(stringResource(R.string.watch_title), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(if (on) R.string.watch_on_body else R.string.watch_off_body), color = Tw.Text2)
            }
            androidx.compose.material3.Switch(
                checked = on,
                onCheckedChange = { on = it; app.tripwire.guardian.AlertWatchService.set(context, it) },
                modifier = Modifier.semantics { contentDescription = context.getString(R.string.watch_title) },
            )
        }
    }
}

@Composable
private fun PeopleRow(people: List<Person>, selected: Person, onSelect: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        people.forEach { person ->
            val on = person.deviceId == selected.deviceId
            val name = person.nickname.ifBlank { stringResource(R.string.feed_someone) }
            if (on) {
                Button(onClick = {}, shape = CircleShape, modifier = Modifier.heightIn(min = 48.dp)) { Text(name, style = MaterialTheme.typography.labelLarge) }
            } else {
                OutlinedButton(onClick = { onSelect(person.deviceId) }, shape = CircleShape, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(name, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

@Composable
private fun AlertCard(alert: Alert, advice: AdviceState?, onAdvice: (Alert, String, String) -> Unit) {
    val zone = ZoneId.systemDefault()
    val at = Instant.ofEpochMilli(alert.createdAtMillis).atZone(zone)
    val day = when (val label = dayLabel(alert.createdAtMillis, System.currentTimeMillis(), zone)) {
        DayLabel.Today -> stringResource(R.string.day_today)
        DayLabel.Yesterday -> stringResource(R.string.day_yesterday)
        is DayLabel.Earlier -> DATE.format(label.date)
    }
    val scamLabel = stringResource(Labels.scam(alert.scamType))
    val actionLabel = stringResource(Labels.action(alert.action))
    val fixed = stringResource(if (alert.continued) R.string.advice_fixed_continued else R.string.advice_fixed_stopped)
    val outcomeColor = if (alert.continued) Tw.SignalText else Tw.Ok

    Surface(shape = RoundedCornerShape(16.dp), color = if (alert.continued) Tw.SignalSoft else Tw.Surface, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("$day · ${TIME.format(at)}", style = MaterialTheme.typography.bodyMedium, color = Tw.Text2)
            Text(if (alert.aboutAStep) actionLabel else scamLabel, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
            Text(alert.summary)
            if (!alert.aboutAStep) Text(actionLabel, style = MaterialTheme.typography.bodyMedium, color = Tw.Text2)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutcomeIcon(alert.continued, outcomeColor)
                Text(
                    stringResource(if (alert.changed) R.string.feed_changed else if (alert.continued) R.string.feed_continued else R.string.feed_stopped),
                    style = MaterialTheme.typography.titleMedium,
                    color = outcomeColor,
                )
            }
            Text(
                stringResource(if (alert.changed) R.string.feed_changed_advice else if (alert.continued) R.string.feed_continued_advice else R.string.feed_stopped_advice),
                style = MaterialTheme.typography.bodyMedium,
                color = Tw.Text2,
            )
            when (advice) {
                null -> OutlinedButton(
                    onClick = { onAdvice(alert, scamLabel, fixed) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                    shape = RoundedCornerShape(12.dp),
                ) { Text(stringResource(R.string.advice_button), style = MaterialTheme.typography.labelLarge) }

                AdviceState.Working -> Row(
                    Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    CircularProgressIndicator(Modifier.size(22.dp), color = Tw.Deep, strokeWidth = 3.dp)
                    Text(stringResource(R.string.advice_working), color = Tw.Text2)
                }

                is AdviceState.Ready -> Column(
                    Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    HorizontalDivider(thickness = 2.dp, color = Tw.Line)
                    Text(stringResource(R.string.advice_title), style = MaterialTheme.typography.titleMedium)
                    Text(advice.text)
                    when (advice.route) {
                        AdviceWriter.Route.ON_DEVICE -> DotLine(Tw.Ok, stringResource(R.string.advice_route_device))
                        AdviceWriter.Route.IN_CLOUD -> DotLine(Tw.DotCloud, stringResource(R.string.advice_route_cloud))
                        null -> DotLine(Tw.DotNeutral, stringResource(R.string.advice_route_fixed))
                    }
                }
            }
        }
    }
}

@Composable
private fun ModelStatus(model: AdviceWriter.ModelState, onDownload: () -> Unit) {
    val (dot, text) = when (model) {
        AdviceWriter.ModelState.UNKNOWN -> return
        AdviceWriter.ModelState.AVAILABLE -> Tw.Ok to R.string.model_ready
        AdviceWriter.ModelState.DOWNLOADABLE -> Tw.DotCloud to R.string.model_downloadable
        AdviceWriter.ModelState.DOWNLOADING -> Tw.DotCloud to R.string.model_downloading
        AdviceWriter.ModelState.UNAVAILABLE -> Tw.DotNeutral to R.string.model_unavailable
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        HorizontalDivider(thickness = 2.dp, color = Tw.Line)
        DotLine(dot, stringResource(text))
        if (model == AdviceWriter.ModelState.DOWNLOADABLE) {
            OutlinedButton(onClick = onDownload, modifier = Modifier.heightIn(min = 52.dp), shape = RoundedCornerShape(12.dp)) {
                Text(stringResource(R.string.model_download), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

/* ---------- small pieces ---------- */

@Composable
private fun PrimaryButton(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Tw.Deep, contentColor = Color.White),
        modifier = Modifier.fillMaxWidth().heightIn(min = 60.dp),
    ) { Text(text, fontSize = 20.sp, fontWeight = FontWeight.Bold) }
}

@Composable
private fun QuietButton(text: String, onClick: () -> Unit) {
    TextButton(onClick = onClick, modifier = Modifier.heightIn(min = 48.dp)) {
        Text(text, color = Tw.Text2, textDecoration = TextDecoration.Underline)
    }
}

@Composable
private fun Notice(text: String) {
    Row(Modifier.semantics { liveRegion = LiveRegionMode.Assertive }, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        OutcomeIcon(continued = true, color = Tw.Error)
        Text(text, color = Tw.Error)
    }
}

@Composable
private fun DotLine(dot: Color, text: String, bold: Boolean = false, color: Color = Tw.Text2) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.padding(top = 7.dp).size(12.dp).background(dot, CircleShape))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = color, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)
    }
}

/** The Tripwire mark: two posts joined by a wire. */
@Composable
private fun Mark(size: Dp, color: Color) {
    Canvas(Modifier.size(size)) {
        val u = this.size.width / 32f
        val stroke = 2.5f * u
        drawLine(color, Offset(6 * u, 8 * u), Offset(6 * u, 24 * u), stroke, StrokeCap.Round)
        drawLine(color, Offset(26 * u, 8 * u), Offset(26 * u, 24 * u), stroke, StrokeCap.Round)
        drawLine(color, Offset(6 * u, 16 * u), Offset(26 * u, 16 * u), stroke, StrokeCap.Round)
        drawCircle(color, 2.5f * u, Offset(16 * u, 16 * u))
    }
}

/** A circled tick ("stopped") or a circled exclamation mark ("continued" and notices). Decorative: the text beside it says the same. */
@Composable
private fun OutcomeIcon(continued: Boolean, color: Color) {
    Canvas(Modifier.size(24.dp)) {
        val u = size.width / 24f
        val stroke = 2.5f * u
        drawCircle(color, 10 * u, center, style = Stroke(stroke))
        if (continued) {
            drawLine(color, Offset(12 * u, 7 * u), Offset(12 * u, 13 * u), stroke, StrokeCap.Round)
            drawCircle(color, 1.4f * u, Offset(12 * u, 17 * u))
        } else {
            drawLine(color, Offset(7 * u, 12.5f * u), Offset(10.5f * u, 16 * u), stroke, StrokeCap.Round)
            drawLine(color, Offset(10.5f * u, 16 * u), Offset(17 * u, 8.5f * u), stroke, StrokeCap.Round)
        }
    }
}

@Composable
private fun TickOrCross(ok: Boolean, modifier: Modifier = Modifier) {
    val color = if (ok) Tw.Ok else Tw.Text2
    Canvas(modifier.size(22.dp)) {
        val u = size.width / 22f
        val stroke = 2.5f * u
        if (ok) {
            drawLine(color, Offset(4 * u, 11 * u), Offset(9 * u, 16 * u), stroke, StrokeCap.Round)
            drawLine(color, Offset(9 * u, 16 * u), Offset(18 * u, 6 * u), stroke, StrokeCap.Round)
        } else {
            drawLine(color, Offset(5 * u, 5 * u), Offset(17 * u, 17 * u), stroke, StrokeCap.Round)
            drawLine(color, Offset(17 * u, 5 * u), Offset(5 * u, 17 * u), stroke, StrokeCap.Round)
        }
    }
}

@Suppress("unused")
@Composable
private fun Gap(height: Dp) {
    Spacer(Modifier.height(height).width(0.dp))
}
