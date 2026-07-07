package com.meponto.rider.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * MePonto design tokens, mirrored from docs/design-system.md and app/globals.css
 * (and kept 1:1 with the iOS rider app's Theme.swift). Dark is the default
 * palette; a light palette backs the system/light toggle. Components must always
 * reference these semantic tokens, never raw hex.
 */
data class MeColors(
    val background: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val surfaceHover: Color,
    val line: Color,
    val text: Color,
    val textSoft: Color,
    val muted: Color,
    val accent: Color,
    val accentInk: Color,
    val danger: Color,
    val warning: Color,
    val ok: Color,
    val isDark: Boolean,
)

// Consumer-grade dual palette (delivery-app vibe): light is the default and
// carries saturated brand yellow + lively functional colors; dark is a richer
// nightly variant of the same identity.
val DarkMeColors = MeColors(
    background = Color(0xFF0B0C10),
    surface = Color(0xFF15171E),
    surfaceRaised = Color(0xFF1C1F28),
    surfaceHover = Color(0xFF242836),
    line = Color(0xFF2C3040),
    text = Color(0xFFF6F7FB),
    textSoft = Color(0xFFD8DCE6),
    muted = Color(0xFF98A0AF),
    accent = Color(0xFFFFD100),
    accentInk = Color(0xFF1A1500),
    danger = Color(0xFFFF5C70),
    warning = Color(0xFFFFB454),
    ok = Color(0xFF2DE0A5),
    isDark = true,
)

val LightMeColors = MeColors(
    background = Color(0xFFF6F6F8),
    surface = Color(0xFFFFFFFF),
    surfaceRaised = Color(0xFFF2F3F7),
    surfaceHover = Color(0xFFECEEF4),
    line = Color(0xFFE4E7EE),
    text = Color(0xFF17181C),
    textSoft = Color(0xFF3C4148),
    muted = Color(0xFF7A8291),
    accent = Color(0xFFFFC400),
    accentInk = Color(0xFF201A00),
    danger = Color(0xFFFF4D5E),
    warning = Color(0xFFFF9F1C),
    ok = Color(0xFF00B884),
    isDark = false,
)

val LocalMe = staticCompositionLocalOf { DarkMeColors }

/** Status tone used by badges and ledgers. */
enum class Tone { NEUTRAL, ACCENT, OK, WARNING, DANGER }

fun Tone.fg(c: MeColors): Color = when (this) {
    Tone.NEUTRAL -> c.textSoft
    Tone.ACCENT -> c.accent
    Tone.OK -> c.ok
    Tone.WARNING -> c.warning
    Tone.DANGER -> c.danger
}

fun Tone.bg(c: MeColors): Color = when (this) {
    Tone.NEUTRAL -> c.surfaceRaised
    else -> fg(c).copy(alpha = 0.14f)
}

object MeRadius {
    val card = 16.dp
    val small = 10.dp
}

@Composable
fun MePontoTheme(darkTheme: Boolean, content: @Composable () -> Unit) {
    val me = if (darkTheme) DarkMeColors else LightMeColors
    val colorScheme = if (darkTheme) {
        darkColorScheme(
            primary = me.accent,
            onPrimary = me.accentInk,
            background = me.background,
            surface = me.surface,
            surfaceVariant = me.surfaceRaised,
            outline = me.line,
            onBackground = me.text,
            onSurface = me.text,
        )
    } else {
        lightColorScheme(
            primary = me.accent,
            onPrimary = me.accentInk,
            background = me.background,
            surface = me.surface,
            surfaceVariant = me.surfaceRaised,
            outline = me.line,
            onBackground = me.text,
            onSurface = me.text,
        )
    }
    // Rounded shape scale: text fields, sheets and menus pick these up.
    val shapes = Shapes(
        extraSmall = RoundedCornerShape(10.dp),
        small = RoundedCornerShape(12.dp),
        medium = RoundedCornerShape(16.dp),
        large = RoundedCornerShape(20.dp),
        extraLarge = RoundedCornerShape(28.dp),
    )
    CompositionLocalProvider(LocalMe provides me) {
        MaterialTheme(colorScheme = colorScheme, shapes = shapes, content = content)
    }
}
