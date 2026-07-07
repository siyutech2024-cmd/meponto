package com.meponto.rider.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.Tone
import com.meponto.rider.ui.theme.bg
import com.meponto.rider.ui.theme.fg

/** Soft elevation for cards: gentle shadow in light mode, hairline in dark. */
fun Modifier.cardSurface(me: com.meponto.rider.ui.theme.MeColors): Modifier {
    val shape = RoundedCornerShape(MeRadius.card)
    return this
        .then(
            if (me.isDark) Modifier
            else Modifier.shadow(
                elevation = 6.dp,
                shape = shape,
                ambientColor = Color(0x14000000),
                spotColor = Color(0x1F000000),
            )
        )
        .clip(shape)
        .background(me.surface)
        .then(if (me.isDark) Modifier.border(1.dp, me.line, shape) else Modifier)
}

/** Surface panel card: rounded, softly elevated, semantic tokens. */
@Composable
fun Panel(
    modifier: Modifier = Modifier,
    padding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val me = LocalMe.current
    Column(
        modifier = modifier
            .fillMaxWidth()
            .cardSurface(me)
            .padding(padding),
        content = content,
    )
}

/** Section header: short title + optional trailing text action. */
@Composable
fun SectionHeader(
    title: String,
    actionTitle: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val me = LocalMe.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        Spacer(Modifier.weight(1f))
        if (actionTitle != null && onAction != null) {
            Text(
                actionTitle,
                color = me.accent,
                fontSize = 13.sp,
                modifier = Modifier.clickable { onAction() },
            )
        }
    }
}

/**
 * Square icon chip: the app's standard icon treatment — toned 12% background,
 * toned icon, 8dp radius. Keeps rows scannable without large color blocks.
 */
@Composable
fun IconChip(icon: ImageVector, tone: Tone = Tone.ACCENT, size: Dp = 40.dp) {
    val me = LocalMe.current
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(MeRadius.small))
            .background(tone.bg(me)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tone.fg(me), modifier = Modifier.size(22.dp))
    }
}

/** Status badge (pill). */
@Composable
fun Badge(text: String, tone: Tone = Tone.NEUTRAL) {
    val me = LocalMe.current
    Text(
        text = text,
        color = tone.fg(me),
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(CircleShape)
            .background(tone.bg(me))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

/** Thin accent progress bar. value in 0f..1f. */
@Composable
fun ProgressBar(value: Float) {
    val me = LocalMe.current
    Box(
        Modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(CircleShape)
            .background(me.surfaceRaised)
    ) {
        Box(
            Modifier
                .fillMaxWidth(value.coerceIn(0f, 1f))
                .fillMaxHeight()
                .clip(CircleShape)
                .background(me.accent)
        )
    }
}

/** Primary action button (MePonto yellow). */
@Composable
fun PrimaryButton(
    title: String,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val me = LocalMe.current
    val shape = RoundedCornerShape(MeRadius.card)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(
                if (enabled && !me.isDark) Modifier.shadow(
                    elevation = 6.dp,
                    shape = shape,
                    ambientColor = Color(0x33FFC400),
                    spotColor = Color(0x4DFFC400),
                ) else Modifier
            )
            .clip(shape)
            .background(if (enabled) me.accent else me.surfaceRaised)
            .clickable(enabled = enabled) { onClick() }
            .padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(
                icon,
                contentDescription = null,
                tint = if (enabled) me.accentInk else me.muted,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.size(8.dp))
        }
        Text(
            title,
            color = if (enabled) me.accentInk else me.muted,
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp,
        )
    }
}

/** Tappable list-style action row: icon chip + title/detail + trailing icon. */
@Composable
fun ActionRow(
    icon: ImageVector,
    title: String,
    detail: String,
    tone: Tone = Tone.ACCENT,
    trailing: ImageVector? = null,
    onClick: () -> Unit,
) {
    val me = LocalMe.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .cardSurface(me)
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconChip(icon, tone)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Text(detail, color = me.muted, fontSize = 12.sp)
        }
        if (trailing != null) {
            Icon(trailing, contentDescription = null, tint = me.muted, modifier = Modifier.size(20.dp))
        }
    }
}

/** Compact stat tile used on Home. */
@Composable
fun StatTile(
    title: String,
    value: String,
    icon: ImageVector,
    tone: Tone,
    modifier: Modifier = Modifier,
) {
    val me = LocalMe.current
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(MeRadius.card))
            .background(me.surfaceRaised)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (tone == Tone.NEUTRAL) me.text else tone.fg(me),
            modifier = Modifier.size(22.dp),
        )
        Text(value, color = me.text, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Text(title, color = me.muted, fontSize = 12.sp)
    }
}

/** A labelled metric used in the performance row. */
@Composable
fun Metric(label: String, value: String, modifier: Modifier = Modifier) {
    val me = LocalMe.current
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(value, color = me.text, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Text(label, color = me.muted, fontSize = 11.sp, textAlign = TextAlign.Center)
    }
}

/** Vertical hairline divider used between metrics. */
@Composable
fun VDivider(height: Dp = 32.dp) {
    val me = LocalMe.current
    Box(
        Modifier
            .width(1.dp)
            .height(height)
            .background(me.line)
    )
}

/** Tappable quick-action tile (icon + title + detail). */
@Composable
fun QuickActionTile(
    icon: ImageVector,
    title: String,
    detail: String,
    tone: Tone = Tone.NEUTRAL,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val me = LocalMe.current
    Column(
        modifier = modifier
            .heightIn(min = 96.dp)
            .clip(RoundedCornerShape(MeRadius.card))
            .background(me.surface)
            .border(1.dp, me.line, RoundedCornerShape(MeRadius.card))
            .clickable { onClick() }
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (tone == Tone.NEUTRAL) me.text else tone.fg(me),
            modifier = Modifier.size(22.dp),
        )
        Text(title, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        Text(detail, color = me.muted, fontSize = 11.sp)
    }
}
