package com.meponto.rider.ui.screens

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.R
import com.meponto.rider.data.SplashConfig
import com.meponto.rider.i18n.LocalLoc

/**
 * Launch screen: full-bleed brand yellow (the logo's exact background, so the
 * mark melts into the canvas and only the navy "M" reads), ink-navy wordmark +
 * tagline, springy entrance. Contrast-aware: if the backend pushes a dark
 * background instead, text flips to white automatically.
 */
@Composable
fun SplashScreen(config: SplashConfig) {
    val loc = LocalLoc.current
    val tagline = if (config.tagline.isEmpty()) loc.t("splash.tagline") else config.tagline

    val bg = config.backgroundColor
    val onBg = if (bg.luminance() > 0.5f) config.accentColor else Color.White
    val onBgSoft = onBg.copy(alpha = 0.66f)

    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }
    val scale by animateFloatAsState(if (visible) 1f else 0.82f, tween(560, easing = FastOutSlowInEasing), label = "scale")
    val fade by animateFloatAsState(if (visible) 1f else 0f, tween(600), label = "fade")
    val textRise by animateFloatAsState(if (visible) 0f else 18f, tween(680, easing = FastOutSlowInEasing), label = "rise")
    val barWidth by animateFloatAsState(if (visible) 1f else 0f, tween(720, delayMillis = 260, easing = FastOutSlowInEasing), label = "bar")

    Box(
        modifier = Modifier.fillMaxSize().background(bg),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            // The mark itself — no tile, no halo: on the brand background the
            // logo's own yellow disappears and only the navy M + arrow show.
            Image(
                painter = painterResource(R.drawable.meponto_logo),
                contentDescription = "MePonto",
                modifier = Modifier.size(180.dp).scale(scale).alpha(fade),
            )
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.alpha(fade).graphicsLayer { translationY = textRise },
            ) {
                Text(
                    config.headline,
                    color = onBg,
                    fontWeight = FontWeight.Black,
                    fontSize = 34.sp,
                    letterSpacing = 1.sp,
                )
                Box(
                    Modifier
                        .width((barWidth * 64).dp)
                        .height(4.dp)
                        .clip(CircleShape)
                        .background(onBg),
                )
                Text(
                    tagline,
                    color = onBgSoft,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 36.dp),
                )
            }
        }
    }
}
