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
    // Tropical/Noite v2 additions — semantic secondaries and brand gradients.
    val secondary: Color,       // hot pink: highlights, critical-but-branded accents
    val secondaryInk: Color,    // ink on secondary fills
    val tertiary: Color,        // electric blue (day) / electric purple (night)
    val jungle: Color,          // deep jungle green: hero surfaces (day theme)
    val heroGradient: List<Color>,   // membership/tier hero card backdrop
    val pointsGradient: List<Color>, // points balance / rewards backdrop
)

// "Tropical Modernista / Noite" dual palette — Brazilian-youth color language
// (saturated tropical green, brand yellow, hot pink, sunset orange, electric
// purple) over the same semantic token architecture. Light = daytime Tropical
// (ivory base, high sun-readability); dark = Noite (deep violet night, sunset
// gradients). Components must always reference these semantic tokens, never
// raw hex.
val DarkMeColors = MeColors(
    background = Color(0xFF12081F),
    surface = Color(0xFF1D1230),
    surfaceRaised = Color(0xFF251740),
    surfaceHover = Color(0xFF2E2044),
    line = Color(0xFF2E2044),
    text = Color(0xFFF4EFFA),
    textSoft = Color(0xFFD9D2E8),
    muted = Color(0xFF9D92B3),
    accent = Color(0xFFFFC400),
    accentInk = Color(0xFF2A1400),
    danger = Color(0xFFFF4D6D),
    warning = Color(0xFFFF6A3D),
    ok = Color(0xFF4DE0A8),
    isDark = true,
    secondary = Color(0xFFFF4D8D),
    secondaryInk = Color(0xFFFFFFFF),
    tertiary = Color(0xFFB14DFF),
    jungle = Color(0xFF0B5C3B),
    // Rio sunset: laranja → rosa → roxo.
    heroGradient = listOf(Color(0xFFFF6A3D), Color(0xFFFF4D8D), Color(0xFFB14DFF)),
    pointsGradient = listOf(Color(0xFFFFC400), Color(0xFFFF6A3D), Color(0xFFFF4D8D)),
)

val LightMeColors = MeColors(
    background = Color(0xFFFAF6EE),
    surface = Color(0xFFFFFFFF),
    surfaceRaised = Color(0xFFF4EFE3),
    surfaceHover = Color(0xFFEFE9DA),
    line = Color(0xFFEAE4D4),
    text = Color(0xFF141B14),
    textSoft = Color(0xFF3B4038),
    muted = Color(0xFF8B8778),
    accent = Color(0xFFFFC400),
    accentInk = Color(0xFF3A2C00),
    danger = Color(0xFFE23A4E),
    warning = Color(0xFFFF6A3D),
    ok = Color(0xFF00A868),
    isDark = false,
    secondary = Color(0xFFFF4D8D),
    secondaryInk = Color(0xFFFFFFFF),
    tertiary = Color(0xFF2D6BFF),
    jungle = Color(0xFF0B5C3B),
    // Daytime hero: deep jungle green (yellow figures sit on top of it).
    heroGradient = listOf(Color(0xFF0B5C3B), Color(0xFF0E7A4C)),
    pointsGradient = listOf(Color(0xFFFF8A3D), Color(0xFFFF4D8D), Color(0xFFB14DFF)),
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
    val card = 20.dp
    val small = 12.dp
    val hero = 24.dp
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
        extraSmall = RoundedCornerShape(12.dp),
        small = RoundedCornerShape(14.dp),
        medium = RoundedCornerShape(20.dp),
        large = RoundedCornerShape(24.dp),
        extraLarge = RoundedCornerShape(32.dp),
    )
    CompositionLocalProvider(LocalMe provides me) {
        MaterialTheme(colorScheme = colorScheme, shapes = shapes, content = content)
    }
}
