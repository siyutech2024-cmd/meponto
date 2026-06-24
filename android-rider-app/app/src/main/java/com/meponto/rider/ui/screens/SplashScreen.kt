package com.meponto.rider.ui.screens

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.R
import com.meponto.rider.data.SplashConfig
import com.meponto.rider.i18n.LocalLoc

/**
 * Launch / splash screen. Brand-color gradient background with an animated logo
 * (scale-in + fade + a soft pulsing halo). Driven by SplashConfig, which the
 * MePonto backend can push (background + accent color, headline, tagline).
 * Shown over the app on cold start for its configured duration.
 */
@Composable
fun SplashScreen(config: SplashConfig) {
    val loc = LocalLoc.current
    val tagline = if (config.tagline.isEmpty()) loc.t("splash.tagline") else config.tagline

    val base = config.backgroundColor
    val accent = config.accentColor

    // Brand-color gradient: deep base at the top warming toward the accent at the
    // bottom — derived from the configured colors so backend theming still works.
    val gradient = Brush.verticalGradient(
        listOf(
            lerp(base, Color.Black, 0.20f),
            base,
            lerp(base, accent, 0.30f),
        ),
    )

    // Entrance animation.
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }
    val scale by animateFloatAsState(if (visible) 1f else 0.72f, tween(620, easing = FastOutSlowInEasing), label = "scale")
    val fade by animateFloatAsState(if (visible) 1f else 0f, tween(700), label = "fade")
    val textRise by animateFloatAsState(if (visible) 0f else 24f, tween(700, easing = FastOutSlowInEasing), label = "rise")

    // Gentle infinite halo pulse behind the logo.
    val pulse = rememberInfiniteTransition(label = "pulse")
    val haloScale by pulse.animateFloat(
        initialValue = 1f,
        targetValue = 1.18f,
        animationSpec = infiniteRepeatable(tween(1600, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "halo",
    )
    val haloAlpha by pulse.animateFloat(
        initialValue = 0.28f,
        targetValue = 0.12f,
        animationSpec = infiniteRepeatable(tween(1600, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "haloAlpha",
    )

    Box(
        modifier = Modifier.fillMaxSize().background(gradient),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                // Soft radial halo (pulsing) behind the logo.
                Box(
                    Modifier
                        .size(168.dp)
                        .scale(haloScale)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                listOf(accent.copy(alpha = haloAlpha), Color.Transparent),
                            ),
                        ),
                )
                // Logo disc.
                Box(
                    Modifier
                        .size(128.dp)
                        .scale(scale)
                        .alpha(fade)
                        .clip(CircleShape)
                        .background(accent.copy(alpha = 0.10f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(
                        painter = painterResource(R.drawable.meponto_logo),
                        contentDescription = "MePonto",
                        modifier = Modifier.size(84.dp),
                    )
                }
            }
            Text(
                config.headline,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 32.sp,
                modifier = Modifier.alpha(fade).graphicsLayer { translationY = textRise },
            )
            Text(
                tagline,
                color = accent,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.alpha(fade).graphicsLayer { translationY = textRise }.padding(horizontal = 32.dp),
            )
        }
    }
}
