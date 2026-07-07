package com.meponto.rider.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.GroupAdd
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalAuth
import com.meponto.rider.data.LocalStore
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.ActionRow
import com.meponto.rider.ui.components.Badge
import com.meponto.rider.ui.components.LedgerRow
import com.meponto.rider.ui.components.LoginPromptCard
import com.meponto.rider.ui.components.MembershipCard
import com.meponto.rider.ui.components.Panel
import com.meponto.rider.ui.components.ProgressBar
import com.meponto.rider.ui.components.QRSheet
import com.meponto.rider.ui.components.SectionHeader
import com.meponto.rider.ui.components.StatTile
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.Tone

@Composable
fun HomeScreen(onScan: () -> Unit, onProfile: () -> Unit) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val auth = LocalAuth.current
    var showInvite by remember { mutableStateOf(false) }

    if (showInvite) {
        QRSheet(
            title = loc.t("points.invite"),
            caption = loc.t("points.inviteHint"),
            value = store.inviteQRPayload,
            onDismiss = { showInvite = false },
        )
    }

    Column(Modifier.fillMaxSize().background(me.background)) {
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Spec: no logo top bar — the big greeting IS the header, with the
            // profile entry on the same line. Empty name/ponto never leave
            // dangling separators.
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    val name = store.riderName.trim()
                    Text(
                        if (auth.isMember && name.isNotEmpty()) "${loc.t("home.greeting")}, $name" else loc.t("home.greeting"),
                        color = me.text,
                        fontWeight = FontWeight.Black,
                        fontSize = 30.sp,
                    )
                    Text(
                        if (auth.isMember) {
                            listOf(loc.t("home.rider"), store.profile.ponto.trim())
                                .filter { it.isNotEmpty() }
                                .joinToString(" · ")
                        } else {
                            loc.t("profile.guest")
                        },
                        color = me.muted,
                        fontSize = 13.sp,
                    )
                }
                Icon(
                    Icons.Filled.AccountCircle,
                    contentDescription = loc.t("profile.title"),
                    tint = me.text,
                    modifier = Modifier.size(30.dp).clickable { onProfile() },
                )
            }

            // Membership / tier hero card (member) or login CTA (guest)
            if (auth.isMember) MembershipCard() else LoginPromptCard()

            // Today stats
            if (store.todayStats.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    store.todayStats.forEach { s ->
                        StatTile(
                            title = loc.t(s.titleKey),
                            value = s.value,
                            icon = s.icon,
                            tone = s.tone,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            // Scan + Invite: surface rows with toned icon chips. Yellow stays
            // reserved for the single primary action on screen (the login CTA
            // for guests / key figures for members) per the design system.
            ActionRow(
                icon = Icons.Filled.QrCodeScanner,
                tone = Tone.ACCENT,
                title = loc.t("home.scan"),
                detail = "Ponto · Repasse · Parceiro",
                trailing = Icons.Filled.ChevronRight,
            ) { if (auth.requireMember()) onScan() }

            ActionRow(
                icon = Icons.Filled.GroupAdd,
                tone = Tone.OK,
                title = loc.t("points.invite"),
                detail = loc.t("points.inviteHint"),
                trailing = Icons.Filled.QrCode2,
            ) { if (auth.requireMember()) showInvite = true }

            // Performance — spec's tri-color KPI blocks: yellow / blue-purple /
            // pink tinted tiles, one hero number each.
            store.performance?.let { perf ->
                Panel {
                    SectionHeader(loc.t("home.performance"))
                    Spacer(Modifier.size(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        KpiTile(loc.t("home.orders"), "${perf.orders}", me.accent, Modifier.weight(1f))
                        KpiTile(loc.t("home.tsh"), String.format("%.1f", perf.tshHours), me.tertiary, Modifier.weight(1f))
                        KpiTile(loc.t("home.ar"), "${perf.acceptanceRate}%", me.secondary, Modifier.weight(1f))
                    }
                    if (perf.cancelledOrders > 0) {
                        Spacer(Modifier.size(10.dp))
                        Text(
                            "${loc.t("home.caa")}: ${perf.cancelledOrders}",
                            color = me.danger,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp,
                        )
                    }
                }
            }

            // Missions
            if (store.missions.isNotEmpty()) {
                Panel {
                    SectionHeader(loc.t("home.missions"))
                    Spacer(Modifier.size(14.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        store.missions.forEach { m ->
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(m.title, color = me.textSoft, fontSize = 14.sp, modifier = Modifier.weight(1f))
                                    when {
                                        m.claimed -> Badge(loc.t("mission.claimed"), Tone.OK)
                                        m.claimable -> Text(
                                            "${loc.t("mission.claim")} ${m.reward}",
                                            color = me.accentInk,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp,
                                            modifier = Modifier
                                                .clip(CircleShape)
                                                .background(me.accent)
                                                .clickable { if (auth.requireMember()) store.claimMission(m) }
                                                .padding(horizontal = 12.dp, vertical = 5.dp),
                                        )
                                        else -> Badge(m.reward, Tone.ACCENT)
                                    }
                                }
                                ProgressBar(m.progress)
                            }
                        }
                    }
                }
            }

            // Cash ledger
            if (store.cashLedger.isNotEmpty()) {
                Panel {
                    SectionHeader(loc.t("home.cashLedger"))
                    Spacer(Modifier.size(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        store.cashLedger.forEach { e -> LedgerRow(e) }
                    }
                }
            }

            // Partner benefits
            if (store.partnerBenefits.isNotEmpty()) {
                Panel {
                    SectionHeader(loc.t("home.benefits"))
                    Spacer(Modifier.size(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        store.partnerBenefits.forEach { b ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(b.partner, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                    Text(
                                        "${b.service} · ${loc.t("map.discount")} ${b.discount}",
                                        color = me.muted,
                                        fontSize = 12.sp,
                                    )
                                }
                                Badge(b.status, b.tone)
                            }
                        }
                    }
                }
            }

            // Inbox
            if (store.inbox.isNotEmpty()) {
                Panel {
                    SectionHeader(loc.t("home.inbox"))
                    Spacer(Modifier.size(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        store.inbox.forEach { item ->
                            Row(verticalAlignment = Alignment.Top) {
                                Box(
                                    Modifier
                                        .padding(top = 6.dp)
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(me.accent)
                                )
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(item.title, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                    Text(item.detail, color = me.muted, fontSize = 12.sp)
                                }
                                Spacer(Modifier.width(8.dp))
                                Text(item.time, color = me.muted, fontSize = 11.sp)
                            }
                        }
                    }
                }
            }

            // Tier preview — fixed 2-column grid (no clipped horizontal scroll:
            // every threshold is visible without a hidden-content cue).
            Panel {
                SectionHeader(loc.t("home.tier"))
                Spacer(Modifier.size(12.dp))
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    store.tiers.chunked(2).forEach { rowTiers ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            rowTiers.forEach { tier ->
                                Row(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(MeRadius.card))
                                        .background(me.surfaceRaised)
                                        .padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text("${tier.score}", color = me.accent, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                                    Spacer(Modifier.width(10.dp))
                                    Column {
                                        Text(tier.metric, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                        Text(tier.threshold, color = me.muted, fontSize = 11.sp)
                                    }
                                }
                            }
                            if (rowTiers.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }

            Spacer(Modifier.size(8.dp))
        }
    }
}

/** Tinted KPI tile (spec §4): 14% tone wash, ink number, muted label. */
@Composable
private fun KpiTile(label: String, value: String, tone: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    val me = LocalMe.current
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(MeRadius.small))
            .background(tone.copy(alpha = 0.16f))
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(tone))
        Text(value, color = me.text, fontWeight = FontWeight.Black, fontSize = 20.sp)
        Text(label, color = me.muted, fontSize = 11.sp)
    }
}
