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
 * (src/ui/tripwire.css): one deep blue field, amber as the only signal colour,
 * everything else calm and large.
 */
object Tw {
    val Deep = Color(0xFF14344D)
    val Ink = Color(0xFF0E2233)
    val Ground = Color(0xFFEEF3F6)
    val Surface = Color(0xFFFFFFFF)
    val Text2 = Color(0xFF34495A)
    val Line = Color(0xFFC9D6DE)
    val LineSoft = Color(0xFFE3EAEF)
    val OnDeep = Color(0xFFF4F8FA)
    val OnDeep2 = Color(0xFFD5E3EC)
    val Signal = Color(0xFFF0B429)
    val SignalSoft = Color(0xFFFFF3D1)
    val SignalText = Color(0xFF6B4100)
    val Ok = Color(0xFF17553B)
    val Error = Color(0xFF7A2E0E)
    val DotCloud = Color(0xFFB25E00)
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
    outline = Color(0xFF6F8798),
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
