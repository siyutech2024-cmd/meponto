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
import com.meponto.rider.i18n.LocalLoc
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
    val p = store.profile
    val tier = p.tier

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeRadius.card))
            .background(Brush.linearGradient(tier.gradient))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Header: plan label + tier badge with stars
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(
                    loc.t("member.title").uppercase(),
                    color = tier.accent,
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp,
                )
                Text(p.name, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(tier.label, color = Color.White, fontWeight = FontWeight.Black, fontSize = 13.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    for (i in 0 until 5) {
                        Icon(
                            if (i < tier.stars) Icons.Filled.Star else Icons.Filled.StarBorder,
                            contentDescription = null,
                            tint = if (i < tier.stars) tier.accent else Color.White.copy(alpha = 0.35f),
                            modifier = Modifier.size(12.dp),
                        )
                    }
                }
            }
        }

        // Score + next target + available balance
        Row(verticalAlignment = Alignment.Bottom) {
            Text("${p.tierScore}", color = Color.White, fontWeight = FontWeight.Black, fontSize = 36.sp)
            Spacer(Modifier.width(8.dp))
            Text(
                tier.nextTarget,
                color = tier.accent,
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp,
                modifier = Modifier.weight(1f).padding(bottom = 6.dp),
            )
            Column(horizontalAlignment = Alignment.End) {
                Text(brl(store.wallet.available), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(loc.t("wallet.available"), color = Color.White.copy(alpha = 0.6f), fontSize = 11.sp)
            }
        }

        // Benefit chip
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.14f))
                .padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Color.White, modifier = Modifier.size(13.dp))
            Text("${loc.t("member.benefit")}: ${tier.benefit}", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
        }

        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.18f)))

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
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(icon, contentDescription = null, tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.size(16.dp))
        Text(label, color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
        Spacer(Modifier.weight(1f))
        Text(value, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
    }
}
