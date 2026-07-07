package com.meponto.rider.ui.components

import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalStore
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
fun MembershipCard() {
    val loc = LocalLoc.current
    val store = LocalStore.current
    val me = LocalMe.current
    val p = store.profile
    val tier = p.tier

    // Design-system panel: dark surface + hairline, tier color used as an
    // accent (label chip, stars, next-target) — no gradients, no white-on-color.
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .cardSurface(me)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Header: plan label + name | tier chip + stars
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(
                    loc.t("member.title").uppercase(),
                    color = me.muted,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 11.sp,
                )
                Text(p.name, color = me.text, fontWeight = FontWeight.Bold, fontSize = 20.sp)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(
                    tier.label,
                    color = tier.accent,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(tier.accent.copy(alpha = 0.14f))
                        .padding(horizontal = 10.dp, vertical = 3.dp),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    for (i in 0 until 5) {
                        Icon(
                            if (i < tier.stars) Icons.Filled.Star else Icons.Filled.StarBorder,
                            contentDescription = null,
                            tint = if (i < tier.stars) tier.accent else me.line,
                            modifier = Modifier.size(12.dp),
                        )
                    }
                }
            }
        }

        // Score + next target + available balance — the yellow number is the
        // card's single point of emphasis.
        Row(verticalAlignment = Alignment.Bottom) {
            Text("${p.tierScore}", color = me.accent, fontWeight = FontWeight.Black, fontSize = 34.sp)
            Spacer(Modifier.width(10.dp))
            Text(
                tier.nextTarget,
                color = me.muted,
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp,
                modifier = Modifier.weight(1f).padding(bottom = 6.dp),
            )
            Column(horizontalAlignment = Alignment.End) {
                Text(brl(store.wallet.available), color = me.text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(loc.t("wallet.available"), color = me.muted, fontSize = 11.sp)
            }
        }

        // Benefit line
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = tier.accent, modifier = Modifier.size(14.dp))
            Text("${loc.t("member.benefit")}: ${tier.benefit}", color = me.textSoft, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
        }

        Box(Modifier.fillMaxWidth().height(1.dp).background(me.line))

        // Identity rows
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            IdRow(Icons.Filled.LocationOn, loc.t("member.ponto"), p.ponto)
            IdRow(Icons.Filled.Group, loc.t("member.leader"), p.leader)
            IdRow(Icons.Filled.Map, loc.t("member.bairro"), p.bairro)
            IdRow(Icons.Filled.Tag, loc.t("member.id99"), p.ninetyNineId)
        }
    }
}

@Composable
private fun IdRow(icon: ImageVector, label: String, value: String) {
    val me = LocalMe.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(icon, contentDescription = null, tint = me.muted, modifier = Modifier.size(16.dp))
        Text(label, color = me.muted, fontSize = 12.sp)
        Spacer(Modifier.weight(1f))
        Text(value, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
    }
}
