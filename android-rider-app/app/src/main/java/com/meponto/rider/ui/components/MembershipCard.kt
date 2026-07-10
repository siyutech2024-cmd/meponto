package com.meponto.rider.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalStore
import com.meponto.rider.data.RiderTierInfo
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.MeRadius

private fun brl(v: Double): String = "R$ " + String.format("%.2f", v).replace('.', ',')

/**
 * 会员卡 / membership tier card — mirrors the hero card on the web rider home:
 * tier level + stars + score + next-target + benefit + available balance, plus
 * the rider's affiliation (网点 / 队长 / 片区 / 99 ID).
 */
@Composable
fun MembershipCard(onOpenStatement: (() -> Unit)? = null) {
    val loc = LocalLoc.current
    val store = LocalStore.current
    val p = store.profile

    // UNIFIED tier: prefer the backend-computed status (rolling-window earned
    // points — the same engine that prices mall redemptions). The local
    // heuristic only fills in before the first hydration.
    val server = store.serverTier
    val tier = if (server != null) {
        val discountPct = ((1.0 - server.redeemDiscount) * 100).toInt()
        RiderTierInfo(
            key = when (server.tier) {
                "diamante" -> "diamond"
                "ouro" -> "gold"
                "prata" -> "orange"
                "bronze" -> "green"
                else -> "base"
            },
            label = server.label,
            stars = when (server.tier) {
                "diamante" -> 5; "ouro" -> 4; "prata" -> 3; "bronze" -> 2; else -> 1
            },
            benefit = if (discountPct > 0) "${loc.t("member.discount")} -$discountPct%" else loc.t("member.discountNone"),
            nextTarget = server.nextTierAt
                ?.let { "${loc.t("member.next")}: ${(it - server.earnedInWindow).coerceAtLeast(0)} pts → ${server.nextTierLabel}" }
                ?: loc.t("member.top"),
        )
    } else {
        p.tier
    }

    // Tier-gradient membership card — the one intentional "hero" surface in
    // the app: the tier color IS the card, white typography on top, with the
    // Burle Marx wave motif (Copacabana calçadão) as the brand pattern.
    val me = LocalMe.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeRadius.hero))
            .background(Brush.linearGradient(me.heroGradient))
            .then(if (onOpenStatement != null) Modifier.clickable { onOpenStatement() } else Modifier),
    ) {
        WaveMotif(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .size(200.dp, 100.dp),
            alpha = 0.22f,
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
        // Header: plan label + name | tier chip + stars
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(
                    loc.t("member.title").uppercase(),
                    color = Color.White.copy(alpha = 0.72f),
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp,
                )
                Text(
                    p.name,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = if (p.name.length > 22) 16.sp else 20.sp,
                    lineHeight = if (p.name.length > 22) 20.sp else 24.sp,
                    maxLines = 2,
                )
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(
                    tier.label,
                    color = me.accentInk,
                    fontWeight = FontWeight.Black,
                    fontSize = 11.sp,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(me.accent)
                        .padding(horizontal = 12.dp, vertical = 5.dp),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    for (i in 0 until 5) {
                        Icon(
                            if (i < tier.stars) Icons.Filled.Star else Icons.Filled.StarBorder,
                            contentDescription = null,
                            tint = if (i < tier.stars) me.accent else Color.White.copy(alpha = 0.35f),
                            modifier = Modifier.size(12.dp),
                        )
                    }
                }
            }
        }

        // AVAILABLE POINTS is the hero number (tap → full statement); the
        // next-tier line tracks CUMULATIVE earned points, decay-proof.
        Row(verticalAlignment = Alignment.Bottom) {
            Text("${store.pointsBalance}", color = me.accent, fontWeight = FontWeight.Black, fontSize = 52.sp)
            Spacer(Modifier.width(6.dp))
            Text(
                "PTS",
                color = Color.White.copy(alpha = 0.7f),
                fontWeight = FontWeight.Black,
                fontSize = 11.sp,
                modifier = Modifier.padding(bottom = 10.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                tier.nextTarget,
                color = Color.White.copy(alpha = 0.85f),
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp,
                modifier = Modifier.weight(1f).padding(bottom = 6.dp),
            )
            Column(horizontalAlignment = Alignment.End) {
                Text(brl(store.wallet.available), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(loc.t("wallet.available"), color = Color.White.copy(alpha = 0.6f), fontSize = 11.sp)
            }
        }

        // Progress toward the next tier (v4 hero track: yellow→orange fill).
        val progress = server?.let { st ->
            st.nextTierAt?.let { next -> (st.earnedInWindow.toFloat() / next).coerceIn(0f, 1f) }
        } ?: 1f
        Box(
            Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.16f)),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(progress)
                    .height(8.dp)
                    .clip(CircleShape)
                    .background(Brush.horizontalGradient(listOf(me.accent, Color(0xFFFF8A3D)))),
            )
        }

        // Benefit line
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = me.accent, modifier = Modifier.size(14.dp))
            Text("${loc.t("member.benefit")}: ${tier.benefit}", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
        }

        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.18f)))

        // Identity rows — only the fields this rider actually has (public
        // members without a station/99 ID don't get four empty lines).
        val idRows = listOf(
            Triple(Icons.Filled.LocationOn, loc.t("member.ponto"), p.ponto),
            Triple(Icons.Filled.Group, loc.t("member.leader"), p.leader),
            Triple(Icons.Filled.Map, loc.t("member.bairro"), p.bairro),
            Triple(Icons.Filled.Tag, loc.t("member.id99"), p.ninetyNineId),
        ).filter { it.third.isNotBlank() }
        if (idRows.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                idRows.forEach { (icon, label, value) -> IdRow(icon, label, value) }
            }
        }
        }
    }
}

@Composable
private fun IdRow(icon: ImageVector, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(icon, contentDescription = null, tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.size(16.dp))
        Text(label, color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
        Spacer(Modifier.weight(1f))
        Text(value, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
    }
}
