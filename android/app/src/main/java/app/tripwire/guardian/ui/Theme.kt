package app.tripwire.guardian.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * The same "harbour light" tokens as the extension and the web family page
 * (src/ui/tripwire.css): one deep royal-navy field, one brighter blue as the only accent,
 * everything else calm and large.
 */
object Tw {
    val Deep = Color(0xFF15335F)
    val Ink = Color(0xFF0D1F3A)
    val Ground = Color(0xFFF4F7FC)
    val Surface = Color(0xFFFFFFFF)
    val Text2 = Color(0xFF354A68)
    val Line = Color(0xFFCBD6E8)
    val LineSoft = Color(0xFFE2E9F4)
    val OnDeep = Color(0xFFF5F8FD)
    val OnDeep2 = Color(0xFFD3DEF0)
    val Signal = Color(0xFF4F7FE8)
    val SignalSoft = Color(0xFFEAF1FE)
    val SignalText = Color(0xFF1D43A6)
    val Ok = Color(0xFF1C48B0)
    val Error = Color(0xFF7A2E0E)
    val DotCloud = Color(0xFF4F7FE8)
    val DotNeutral = Color(0xFF5B6570)
}

private val colors = lightColorScheme(
    primary = Tw.Deep,
    onPrimary = Color.White,
    secondary = Tw.Deep,
    background = Tw.Ground,
    onBackground = Tw.Ink,
    surface = Tw.Surface,
    onSurface = Tw.Ink,
    onSurfaceVariant = Tw.Text2,
    outline = Color(0xFF6B809F),
    error = Tw.Error,
)

// Body text never goes below 18sp: the guardian may be reading this in a hurry.
private val typography = Typography(
    headlineLarge = TextStyle(fontSize = 34.sp, lineHeight = 38.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
    headlineSmall = TextStyle(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.Bold),
    bodyLarge = TextStyle(fontSize = 18.sp, lineHeight = 27.sp),
    bodyMedium = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    labelLarge = TextStyle(fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.Bold),
)

@Composable
fun TripwireTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
