package com.meponto.rider.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke

/**
 * Burle Marx wave motif (Copacabana calçadão) — the MePonto brand pattern for
 * hero/gradient cards. Draws three stacked quadratic waves. Place inside a
 * clipped Box, typically aligned BottomEnd with low alpha so typography on the
 * card stays readable.
 */
@Composable
fun WaveMotif(
    modifier: Modifier = Modifier,
    color: Color = Color.White,
    alpha: Float = 0.25f,
    strokeWidth: Float = 14f,
) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val amp = h / 5f
        val seg = w / 4f
        for (i in 0..2) {
            val baseY = h * (0.30f + 0.28f * i)
            val path = Path().apply {
                moveTo(-seg / 2f, baseY)
                var x = -seg / 2f
                while (x < w + seg) {
                    quadraticBezierTo(x + seg / 2f, baseY - amp * 2f, x + seg, baseY)
                    x += seg
                }
            }
            drawPath(path, color = color.copy(alpha = alpha), style = Stroke(width = strokeWidth))
        }
    }
}
