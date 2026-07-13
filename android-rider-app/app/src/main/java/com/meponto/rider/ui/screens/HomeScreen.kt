package com.meponto.rider.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalAuth
import com.meponto.rider.data.LocalStore
import com.meponto.rider.i18n.AppLanguage
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.i18n.LocalizationManager
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
import com.meponto.rider.ui.theme.appBackground
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.Tone

@Composable
fun HomeScreen(onScan: () -> Unit, onProfile: () -> Unit, onOpenMall: () -> Unit) {
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

    Column(Modifier.fillMaxSize().appBackground(me)) {
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // v4 header: wordmark ("Me" ink + "Ponto" tropical green) with an
            // ink avatar disc (yellow initial); big 32sp greeting below with the
            // name popping in green (day) / yellow (night). No dangling "·".
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = me.text)) { append("Me") }
                        withStyle(SpanStyle(color = if (me.isDark) me.accent else me.ok)) { append("Ponto") }
                    },
                    fontWeight = FontWeight.Black,
                    fontSize = 16.sp,
                )
                Spacer(Modifier.weight(1f))
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(me.text)
                        .clickable { onProfile() },
                    contentAlignment = Alignment.Center,
                ) {
                    val initial = store.riderName.trim().take(1).uppercase()
                    if (initial.isNotEmpty()) {
                        Text(initial, color = me.accent, fontWeight = FontWeight.Black, fontSize = 13.sp)
                    } else {
                        Icon(
                            Icons.Filled.AccountCircle,
                            contentDescription = loc.t("profile.title"),
                            tint = me.accent,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                // First name only — full legal names (3-4 words) blow up the 32sp line.
                val name = store.riderName.trim().split(" ").firstOrNull().orEmpty()
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = me.text)) { append(loc.t("home.greeting")) }
                        if (auth.isMember && name.isNotEmpty()) {
                            withStyle(SpanStyle(color = me.text)) { append(", ") }
                            withStyle(SpanStyle(color = if (me.isDark) me.accent else me.ok)) { append(name) }
                        }
                    },
                    fontWeight = FontWeight.Black,
                    fontSize = 32.sp,
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
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                )
            }

            // Membership / tier hero card (member) or login CTA (guest)
            if (auth.isMember) MembershipCard(onOpenStatement = onOpenMall) else LoginPromptCard()

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
                    // NOTE: use a plain title Text here, NOT SectionHeader —
                    // SectionHeader is already fillMaxWidth, so nesting it in this
                    // Row left no width for the date, which then wrapped one char
                    // per line and blew a tall empty gap open once logged in.
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(loc.t("home.performance"), color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                        Spacer(Modifier.weight(1f))
                        if (perf.date.isNotBlank()) {
                            Text(perf.date, color = me.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    // Background block filling the header→tiles space: a tinted
                    // 7-day summary banner so the panel top never looks empty.
                    perf.weekOrders?.let { wk ->
                        Spacer(Modifier.size(10.dp))
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(MeRadius.card))
                                .background(me.accent.copy(alpha = 0.12f))
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "${loc.t("home.weekSummary")}: $wk ${loc.t("home.ordersUnit")}" +
                                    (perf.weekOnlineHours?.let { " · ${String.format("%.1f", it)} h" } ?: ""),
                                color = me.text, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                            )
                        }
                    }
                    Spacer(Modifier.size(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        KpiTile(loc.t("home.orders"), "${perf.orders}", me.accent, me.accentInk, Modifier.weight(1f))
                        KpiTile(loc.t("home.hours"), String.format("%.1f", perf.tshHours), me.tertiary, androidx.compose.ui.graphics.Color.White, Modifier.weight(1f))
                        KpiTile(loc.t("home.ar"), "${perf.acceptanceRate}%", me.secondary, me.secondaryInk, Modifier.weight(1f))
                    }
                    Spacer(Modifier.size(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        perf.tshPercent?.let { KpiTile(loc.t("home.tshPct"), String.format("%.0f%%", it), me.ok, androidx.compose.ui.graphics.Color.White, Modifier.weight(1f)) }
                        KpiTile(loc.t("home.caa"), String.format("%.1f%%", perf.cancelledOrders.toDouble()), me.danger, androidx.compose.ui.graphics.Color.White, Modifier.weight(1f))
                        perf.weekOrders?.let { KpiTile(loc.t("home.week"), "$it", me.warning, androidx.compose.ui.graphics.Color.White, Modifier.weight(1f)) }
                    }
                    // SECOND source — rider-status aggregate (lifetime), shown
                    // alongside the T+1 daily KPI so both systems stay visible.
                    store.statusTotals?.let { st ->
                        Spacer(Modifier.size(4.dp))
                        Text(
                            "${loc.t("home.lifetime")}: ${st.totalOrders} ${loc.t("home.ordersUnit")} · ${String.format("%.1f", st.onlineHours)} h · AR ${String.format("%.0f", st.ar)}%" +
                                (if (st.lastReportDate.isNotBlank()) " · ${st.lastReportDate}" else ""),
                            color = me.muted,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
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
                                    Text(localizeMissionTitle(m.title, loc), color = me.textSoft, fontSize = 14.sp, modifier = Modifier.weight(1f))
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
                                        else -> Text(
                                            m.reward,
                                            color = androidx.compose.ui.graphics.Color.White,
                                            fontWeight = FontWeight.Black,
                                            fontSize = 10.sp,
                                            modifier = Modifier
                                                .clip(CircleShape)
                                                .background(androidx.compose.ui.graphics.Color(0xFFFF8A3D))
                                                .padding(horizontal = 9.dp, vertical = 3.dp),
                                        )
                                    }
                                }
                                ProgressBar(m.progress)
                            }
                        }
                    }
                }
            }

            // Cash ledger — home shows ONLY T+1 settlement income (Repasse /
            // "payout"), newest first, each with its date. Withdrawals, PontoMall
            // cash and other movements stay in the Wallet tab.
            run {
                val income = store.cashLedger
                    .filter { it.type == "payout" }
                    .sortedByDescending { it.at }
                if (income.isNotEmpty()) {
                    Panel {
                        SectionHeader(loc.t("home.cashLedger"))
                        Spacer(Modifier.size(12.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            income.forEach { e ->
                                val d = e.at.take(10)
                                LedgerRow(
                                    if (d.isNotBlank()) e.copy(detail = listOf(d, e.detail).filter { it.isNotBlank() }.joinToString(" · ")) else e
                                )
                            }
                        }
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

            // Tier ladder — REAL thresholds from the unified backend engine
            // (cumulative earned points); the rider's current rung glows.
            val ladder = store.serverTier?.ladder ?: emptyList()
            if (ladder.isNotEmpty()) {
                Panel {
                    SectionHeader(loc.t("home.tier"))
                    Spacer(Modifier.size(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        ladder.chunked(2).forEach { rowSteps ->
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                rowSteps.forEach { step ->
                                    val current = store.serverTier?.tier == step.tier
                                    Row(
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(RoundedCornerShape(MeRadius.small))
                                            .background(if (current) me.accent.copy(alpha = 0.18f) else me.surfaceRaised)
                                            .then(
                                                if (current) Modifier.border(1.dp, me.accent, RoundedCornerShape(MeRadius.small))
                                                else Modifier
                                            )
                                            .padding(horizontal = 12.dp, vertical = 10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Column {
                                            Text(step.label, color = me.text, fontWeight = FontWeight.Black, fontSize = 13.sp)
                                            Text(
                                                if (step.minEarned > 0) "≥ ${step.minEarned} pts" else "—",
                                                color = if (current) me.accent else me.muted,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 11.sp,
                                            )
                                        }
                                    }
                                }
                                if (rowSteps.size == 1) Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.size(8.dp))
        }
    }
}

/**
 * v4 KPI block. Tropical day = SOLID color tiles (yellow/pink/blue) with
 * on-color type; Noite = dark surface + hairline, the NUMBER carries the color.
 */
@Composable
private fun KpiTile(
    label: String,
    value: String,
    tone: androidx.compose.ui.graphics.Color,
    onTone: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    val me = LocalMe.current
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(MeRadius.card))
            .background(if (me.isDark) me.surface else tone)
            .then(if (me.isDark) Modifier.border(1.dp, me.line, RoundedCornerShape(MeRadius.card)) else Modifier)
            .padding(horizontal = 12.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            value,
            color = if (me.isDark) tone else onTone,
            fontWeight = FontWeight.Black,
            fontSize = 24.sp,
        )
        Text(
            label.uppercase(),
            color = if (me.isDark) me.muted else onTone.copy(alpha = 0.75f),
            fontWeight = FontWeight.Bold,
            fontSize = 9.sp,
            letterSpacing = androidx.compose.ui.unit.TextUnit(1.2f, androidx.compose.ui.unit.TextUnitType.Sp),
        )
    }
}

/** Localize backend mission titles (seeded in Chinese, shared with the zh
 *  console) into the app language. Matches the known weekly-task patterns and
 *  keeps the dynamic target number; unknown titles pass through unchanged. */
private fun localizeMissionTitle(title: String, loc: LocalizationManager): String {
    if (loc.language == AppLanguage.ZH) return title
    Regex("""本周完单\s*(\d+)\s*单""").find(title)?.let {
        return loc.t("mission.weekOrders").replace("{n}", it.groupValues[1])
    }
    Regex("""本周签到\s*(\d+)\s*天""").find(title)?.let {
        return loc.t("mission.weekCheckin").replace("{n}", it.groupValues[1])
    }
    return title
}
