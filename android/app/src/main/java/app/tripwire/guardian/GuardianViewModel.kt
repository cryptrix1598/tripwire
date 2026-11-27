package app.tripwire.guardian

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class PairError { FORMAT, NOT_FOUND, FAILED }

sealed interface AdviceState {
    data object Working : AdviceState
    data class Ready(val text: String, val route: AdviceWriter.Route?) : AdviceState
}

data class UiState(
    val starting: Boolean = true,
    val startFailed: Boolean = false,
    val people: List<Person> = emptyList(),
    val selectedId: String? = null,
    val pairing: Boolean = false,
    val pairBusy: Boolean = false,
    val pairError: PairError? = null,
    val alerts: List<Alert>? = null,
    val alertsFailed: Boolean = false,
    val hold: Hold? = null,
    val holdBusy: Boolean = false,
    val holdFailed: Boolean = false,
    val advice: Map<String, AdviceState> = emptyMap(),
    val model: AdviceWriter.ModelState = AdviceWriter.ModelState.UNKNOWN,
) {
    val selected: Person? get() = people.firstOrNull { it.deviceId == selectedId } ?: people.firstOrNull()
    val showPairing: Boolean get() = pairing || people.isEmpty()
}

class GuardianViewModel(app: Application) : AndroidViewModel(app) {
    private val repository = GuardianRepository()
    private val writer = AdviceWriter()
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var uid: String? = null
    private var alertsJob: Job? = null
    private var holdJob: Job? = null
    private var watching: String? = null
    private var seen: Set<String>? = null

    init {
        start()
    }

    fun start() {
        _state.update { it.copy(starting = true, startFailed = false) }
        viewModelScope.launch {
            try {
                val id = repository.signIn()
                uid = id
                launch { _state.update { it.copy(model = writer.modelState()) } }
                repository.people(id)
                    .catch { _state.update { s -> s.copy(starting = false, startFailed = true) } }
                    .collect { people ->
                        _state.update { it.copy(starting = false, people = people) }
                        watch(_state.value.selected)
                    }
            } catch (_: Exception) {
                _state.update { it.copy(starting = false, startFailed = true) }
            }
        }
    }

    fun select(deviceId: String) {
        _state.update { it.copy(selectedId = deviceId, pairing = false) }
        watch(_state.value.selected)
    }

    fun showPairing(show: Boolean) = _state.update { it.copy(pairing = show, pairError = null) }

    private fun watch(person: Person?) {
        if (person?.deviceId == watching) return
        watching = person?.deviceId
        alertsJob?.cancel()
        holdJob?.cancel()
        seen = null
        _state.update { it.copy(alerts = null, alertsFailed = false, hold = null, holdFailed = false) }
        if (person == null) return
        holdJob = viewModelScope.launch {
            repository.hold(person.deviceId).catch { emit(null) }.collect { hold -> _state.update { it.copy(hold = hold) } }
        }
        alertsJob = viewModelScope.launch {
            repository.alertsOnceAllowed(person.deviceId)
                .catch { _state.update { s -> s.copy(alertsFailed = true) } }
                .collect { alerts ->
                    // Notify only for alerts that arrive after the first load.
                    seen?.let { known -> alerts.filter { it.id !in known }.forEach { Notifier.alert(getApplication(), person, it) } }
                    seen = alerts.map { it.id }.toSet()
                    _state.update { it.copy(alerts = alerts, alertsFailed = false) }
                }
        }
    }

    /** "Let it go through" or "Keep it on hold", for the selected person's running hold. */
    fun answerHold(release: Boolean) {
        val person = _state.value.selected ?: return
        _state.update { it.copy(holdBusy = true, holdFailed = false) }
        viewModelScope.launch {
            val ok = repository.answerHold(person.deviceId, if (release) "released" else "extended")
            _state.update { it.copy(holdBusy = false, holdFailed = !ok) }
        }
    }

    fun pair(codeInput: String, nicknameInput: String, fallbackName: String) {
        val id = uid ?: return
        val code = Pairing.cleanCode(codeInput)
        if (code == null) {
            _state.update { it.copy(pairError = PairError.FORMAT) }
            return
        }
        _state.update { it.copy(pairBusy = true, pairError = null) }
        viewModelScope.launch {
            val result = repository.pair(id, code, Pairing.cleanNickname(nicknameInput).ifEmpty { fallbackName })
            _state.update {
                when (result) {
                    GuardianRepository.PairResult.OK -> it.copy(pairBusy = false, pairing = false)
                    GuardianRepository.PairResult.NOT_FOUND -> it.copy(pairBusy = false, pairError = PairError.NOT_FOUND)
                    GuardianRepository.PairResult.FAILED -> it.copy(pairBusy = false, pairError = PairError.FAILED)
                }
            }
        }
    }

    /** `fixed` is the built-in advice shown if neither the phone nor the cloud can write one. */
    fun writeAdvice(alert: Alert, scamLabel: String, fixed: String) {
        if (_state.value.advice[alert.id] is AdviceState.Working) return
        _state.update { it.copy(advice = it.advice + (alert.id to AdviceState.Working)) }
        viewModelScope.launch {
            val ready = try {
                val advice = writer.write(scamLabel, alert.continued)
                AdviceState.Ready(advice.text, advice.route)
            } catch (_: Exception) {
                AdviceState.Ready(fixed, null)
            }
            _state.update { it.copy(advice = it.advice + (alert.id to ready)) }
        }
    }

    fun downloadModel() {
        _state.update { it.copy(model = AdviceWriter.ModelState.DOWNLOADING) }
        viewModelScope.launch {
            try {
                writer.download().collect { }
            } catch (_: Exception) {
                // Fall through to re-reading the real state.
            }
            _state.update { it.copy(model = writer.modelState()) }
        }
    }
}
