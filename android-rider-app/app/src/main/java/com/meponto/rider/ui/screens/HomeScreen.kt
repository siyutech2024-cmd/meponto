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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
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
import kotlinx.coroutines.launch
import com.meponto.rider.ui.theme.appBackground
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.Tone

@androidx.compose.runtime.Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun HomeScreen(
    onScan: () -> Unit,
    onProfile: () -> Unit,
    onOpenMall: () -> Unit,
    /** A4/A5: 活动卡点击 (url, title)。默认空实现,方便预览与旧调用点。 */
    onOpenWeb: (String, String) -> Unit = { _, _ -> },
) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val auth = LocalAuth.current
    val refreshScope = androidx.compose.runtime.rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    var showInvite by remember { mutableStateOf(false) }
    var inboxDetail by remember { mutableStateOf<com.meponto.rider.data.InboxItem?>(null) }

    inboxDetail?.let { item ->
        com.meponto.rider.ui.components.DetailDialog(
            title = item.title,
            body = item.detail,
            meta = item.time,
            onDismiss = { inboxDetail = null },
        )
    }

    // 模式二 A2 · 入池欢迎页 —— 只弹一次(本地记住),内容三条规则 + 工资口径。
    val welcomeCtx = androidx.compose.ui.platform.LocalContext.current
    var showProWelcome by remember { mutableStateOf(false) }
    LaunchedEffect(store.isPro, auth.isMember) {
        if (auth.isMember && store.isPro) {
            val prefs = welcomeCtx.getSharedPreferences("meponto_rider", android.content.Context.MODE_PRIVATE)
            if (!prefs.getBoolean("pro_welcome_seen", false)) showProWelcome = true
        }
    }
    if (showProWelcome) {
        com.meponto.rider.ui.components.DetailDialog(
            title = loc.t("pro.welcomeTitle"),
            body = loc.t("pro.welcomeBody"),
            onDismiss = {
                welcomeCtx.getSharedPreferences("meponto_rider", android.content.Context.MODE_PRIVATE)
                    .edit().putBoolean("pro_welcome_seen", true).apply()
                showProWelcome = false
            },
        )
    }

    if (showInvite) {
        QRSheet(
            title = loc.t("points.invite"),
            caption = loc.t("points.inviteHint"),
            value = store.inviteQRPayload,
            onDismiss = { showInvite = false },
        )
    }

    Column(Modifier.fillMaxSize().appBackground(me)) {
        // Pull-to-refresh: re-pull the home snapshot (cash ledger, KPI,
        // notices…) without relaunching the app.
        androidx.compose.material3.pulltorefresh.PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                refreshing = true
                refreshScope.launch { store.refresh(); refreshing = false }
            },
            modifier = Modifier.weight(1f).fillMaxWidth(),
        ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
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
                // Avatar disc: show the rider's on-device photo if set (same
                // photo as the Member Card — field report 2026-07-21), else the
                // yellow initial, else a generic icon.
                val avatarCtx = androidx.compose.ui.platform.LocalContext.current
                val avatarBmp = remember(store.profile.ninetyNineId, store.profile.phone, store.avatarVersion) {
                    com.meponto.rider.data.AvatarStore.load(avatarCtx, store.profile)
                }
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(me.text)
                        .clickable { onProfile() },
                    contentAlignment = Alignment.Center,
                ) {
                    val initial = store.riderName.trim().take(1).uppercase()
                    when {
                        avatarBmp != null -> androidx.compose.foundation.Image(
                            bitmap = avatarBmp.asImageBitmap(),
                            contentDescription = loc.t("profile.title"),
                            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                            modifier = Modifier.fillMaxSize().clip(CircleShape),
                        )
                        initial.isNotEmpty() -> Text(initial, color = me.accent, fontWeight = FontWeight.Black, fontSize = 13.sp)
                        else -> Icon(
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
                Row(verticalAlignment = Alignment.CenterVertically) {
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
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    // 模式二 A1: PRO 徽章 —— 由 pool 字段驱动,入池自动出现、出池自动消失
                    if (auth.isMember && store.isPro) {
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "PRO",
                            color = androidx.compose.ui.graphics.Color(0xFF171B33),
                            fontWeight = FontWeight.Black,
                            fontSize = 12.sp,
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(androidx.compose.ui.graphics.Color(0xFFEDA100))
                                .padding(horizontal = 9.dp, vertical = 3.dp),
                        )
                    }
                }
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

            // 模式二 A3 · 单量双口径卡(PRO 专属). PRO 的工资由加盟商线下结算,
            // 单量是唯一核对锚点:上行=昨日确认(结算口径,来自 T+1 导入),
            // 下行=今日实时估算(抓取,灰色斜体,明确标注以次日确认为准)。
            // 卡内没有任何金额字段 —— 单价永不出现在骑手端(v3.0 R7)。
            if (auth.isMember && store.isPro) {
                LaunchedEffect(Unit) { store.refreshLiveCount() }
                Panel {
                    SectionHeader(loc.t("pro.ordersTitle"))
                    Spacer(Modifier.size(12.dp))
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            "${store.performance?.orders ?: 0}",
                            color = me.accent, fontWeight = FontWeight.Black, fontSize = 44.sp,
                        )
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.padding(bottom = 6.dp)) {
                            Text(loc.t("pro.confirmedYesterday"), color = me.text, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            store.performance?.date?.takeIf { it.isNotBlank() }?.let {
                                Text(it, color = me.muted, fontSize = 11.sp)
                            }
                        }
                    }
                    store.liveCount?.let { live ->
                        Spacer(Modifier.size(8.dp))
                        Text(
                            loc.t("pro.todayLive").replace("{n}", "${live.finishedToday ?: 0}"),
                            color = me.muted,
                            fontSize = 12.sp,
                            fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                        )
                    }
                    Spacer(Modifier.size(10.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(MeRadius.small))
                            .background(me.accent.copy(alpha = 0.12f))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            loc.t("pro.checkWithFranchise"),
                            color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
                        )
                    }
                }
            }

            // A4 · 活动入口卡。服务端已判定受众与生效窗口 —— 这里非 null 就渲染,
            // 客户端不再自己算日期(手机时钟不可信,时区也不一致)。
            store.activityCard?.let { card ->
                val link = card.linkURL.orEmpty()
                val cardCtx = androidx.compose.ui.platform.LocalContext.current
                Panel(
                    modifier = if (link.isBlank()) Modifier else Modifier.clickable {
                        com.meponto.rider.data.Analytics.log("activity_card_tap", mapOf("title" to card.title.orEmpty()))
                        if (com.meponto.rider.ui.screens.WebLinks.isInternal(link)) {
                            onOpenWeb(link, card.title.orEmpty())
                        } else {
                            com.meponto.rider.ui.screens.WebLinks.openExternally(cardCtx, link)
                        }
                    },
                ) {
                    card.imageURL?.takeIf { it.isNotBlank() }?.let { image ->
                        coil.compose.AsyncImage(
                            model = image,
                            contentDescription = null,
                            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(120.dp)
                                .clip(RoundedCornerShape(MeRadius.small)),
                        )
                        Spacer(Modifier.size(10.dp))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            card.title.orEmpty(),
                            color = me.text, fontWeight = FontWeight.Black, fontSize = 15.sp,
                            modifier = Modifier.weight(1f),
                        )
                        card.badge?.takeIf { it.isNotBlank() }?.let { badge ->
                            Text(
                                badge,
                                color = me.accentInk, fontWeight = FontWeight.Black, fontSize = 10.sp,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(MeRadius.small))
                                    .background(me.accent)
                                    .padding(horizontal = 8.dp, vertical = 3.dp),
                            )
                        }
                    }
                    card.subtitle?.takeIf { it.isNotBlank() }?.let {
                        Spacer(Modifier.size(4.dp))
                        Text(it, color = me.muted, fontSize = 12.sp)
                    }
                }
            }

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
                // Honest copy: the scanner does STATION CHECK-IN only (the old
                // "Ponto · Repasse · Parceiro" promised flows that don't exist).
                detail = loc.t("home.scanHint"),
                trailing = Icons.Filled.ChevronRight,
            ) { if (auth.requireMember()) onScan() }

            // Invite friends — the detail line now shows LIVE referral progress
            // (invited / rewarded), closing the "shared and never heard back" gap.
            ActionRow(
                icon = Icons.Filled.GroupAdd,
                tone = Tone.OK,
                title = loc.t("points.invite"),
                detail = if (store.referrals.isEmpty()) {
                    loc.t("points.inviteHint")
                } else {
                    loc.t("points.inviteProgress")
                        .replace("{n}", "${store.referrals.size}")
                        .replace("{m}", "${store.referrals.count { it.rewarded == true }}")
                },
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

            // Inbox — horizontal swipe cards, NOT a long vertical list (field
            // feedback 2026-07-17). The server already expires notices > 7 days.
            if (store.inbox.isNotEmpty()) {
                Panel {
                    // Plain title Text (NOT SectionHeader — it is fillMaxWidth and
                    // would leave no room for the count, same trap as Performance).
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(loc.t("home.inbox"), color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                        Spacer(Modifier.weight(1f))
                        Text("${store.inbox.size}", color = me.muted, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                    Spacer(Modifier.size(10.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(store.inbox) { item ->
                            Column(
                                modifier = Modifier
                                    .width(240.dp)
                                    .clip(RoundedCornerShape(MeRadius.card))
                                    .background(me.surfaceRaised)
                                    .border(1.dp, me.line, RoundedCornerShape(MeRadius.card))
                                    .clickable { inboxDetail = item }
                                    .padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(Modifier.size(7.dp).clip(CircleShape).background(me.accent))
                                    Spacer(Modifier.width(7.dp))
                                    Text(
                                        item.title, color = me.text, fontWeight = FontWeight.SemiBold,
                                        fontSize = 13.sp, maxLines = 1, modifier = Modifier.weight(1f),
                                    )
                                    Text(item.time, color = me.muted, fontSize = 10.sp)
                                }
                                Text(item.detail, color = me.muted, fontSize = 12.sp, maxLines = 3)
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
