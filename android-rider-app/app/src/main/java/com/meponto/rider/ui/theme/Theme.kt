package com.meponto.rider.ui.theme

import androidx.compose.material3.MaterialTheme
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

val DarkMeColors = MeColors(
    background = Color(0xFF07090D),
    surface = Color(0xFF0D1117),
    surfaceRaised = Color(0xFF111722),
    surfaceHover = Color(0xFF172031),
    line = Color(0xFF263244),
    text = Color(0xFFF8FAFC),
    textSoft = Color(0xFFD7DEE8),
    muted = Color(0xFF9AA6B8),
    accent = Color(0xFFFFD100),
    accentInk = Color(0xFF171400),
    danger = Color(0xFFFF5C70),
    warning = Color(0xFFFFB454),
    ok = Color(0xFF2DD4BF),
    isDark = true,
)

val LightMeColors = MeColors(
    background = Color(0xFFF5F7FA),
    surface = Color(0xFFFFFFFF),
    surfaceRaised = Color(0xFFF8FAFC),
    surfaceHover = Color(0xFFEEF3F8),
    line = Color(0xFFD8E0EA),
    text = Color(0xFF111827),
    textSoft = Color(0xFF334155),
    muted = Color(0xFF64748B),
    accent = Color(0xFFD9A900),
    accentInk = Color(0xFF171400),
    danger = Color(0xFFDC2626),
    warning = Color(0xFFB45309),
    ok = Color(0xFF0F766E),
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
    val card = 8.dp
    val small = 6.dp
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
            onBackground = me.text,
            onSurface = me.text,
        )
    } else {
        lightColorScheme(
            primary = me.accent,
            onPrimary = me.accentInk,
            background = me.background,
            surface = me.surface,
            onBackground = me.text,
            onSurface = me.text,
        )
    }
    CompositionLocalProvider(LocalMe provides me) {
        MaterialTheme(colorScheme = colorScheme, content = content)
    }
}
