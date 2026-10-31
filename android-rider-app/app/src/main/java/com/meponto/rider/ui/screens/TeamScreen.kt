package com.meponto.rider.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.GroupAdd
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalAuth
import com.meponto.rider.data.LocalStore
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.ActionRow
import com.meponto.rider.ui.components.Badge
import com.meponto.rider.ui.components.IconChip
import com.meponto.rider.ui.components.LoginPromptCard
import com.meponto.rider.ui.components.Panel
import com.meponto.rider.ui.components.PrimaryButton
import com.meponto.rider.ui.components.RefreshableScreen
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.Tone
import kotlinx.coroutines.launch

/**
 * 2.8 · 组长模式城市(Boa Vista)的「团队」页 —— 底部导航里替代「班次」
 * (这座城市没有排班)。原生页面只做身份与入口;组员明细、目标进度、
 * 预计提成在已登录的内嵌页 /team 里(服务端算,和后台同一套口径)。
 */
@Composable
fun TeamScreen(onOpenWeb: (String, String) -> Unit) {
    val loc = LocalLoc.current
    val store = LocalStore.current
    val auth = LocalAuth.current
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    val lm = store.leaderMode

    RefreshableScreen(
        title = loc.t("tab.team"),
        refreshing = refreshing,
        onRefresh = {
            refreshing = true
            scope.launch { store.refresh(); refreshing = false }
        },
    ) {
        if (!auth.isMember || lm == null) {
            LoginPromptCard(message = loc.t("auth.gatedAction"))
        } else {
            TeamBody(lm, onOpenWeb)
        }
    }
}

@Composable
private fun TeamBody(lm: com.meponto.rider.data.remote.LeaderModeDto, onOpenWeb: (String, String) -> Unit) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        val isLeader = lm.isLeader == true
        val inTeam = lm.inTeam == true
        val station = lm.stationName.orEmpty()

        // Who am I here
        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconChip(Icons.Filled.Groups, if (isLeader) Tone.ACCENT else Tone.NEUTRAL)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        when {
                            isLeader -> loc.t("team.leaderRole")
                            inTeam -> "${loc.t("team.memberOf")} $station"
                            else -> loc.t("team.noTeam")
                        },
                        color = me.text, fontWeight = FontWeight.Black, fontSize = 16.sp,
                    )
                    if (isLeader && station.isNotBlank()) {
                        Text(station, color = me.muted, fontSize = 12.sp)
                    }
                }
                Badge(loc.t("team.noSchedule"), Tone.NEUTRAL)
            }
            lm.scheduleNotice?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.size(10.dp))
                Text(it, color = me.muted, fontSize = 12.sp)
            }
        }

        // Leader: the team dashboard (H5, logged-in WebView)
        if (isLeader) {
            lm.teamURL?.takeIf { it.isNotBlank() }?.let { url ->
                Panel {
                    Text(loc.t("team.title"), color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                    Spacer(Modifier.size(4.dp))
                    Text(loc.t("team.openHint"), color = me.muted, fontSize = 12.sp)
                    Spacer(Modifier.size(12.dp))
                    PrimaryButton(title = loc.t("team.openTeam"), icon = Icons.Filled.Groups) {
                        com.meponto.rider.data.Analytics.log("team_open")
                        onOpenWeb(url, loc.t("team.title"))
                    }
                }
            }
        }

        // My own orders (latest day + week). Live days carry no AR/CAA.
        store.performance?.let { perf ->
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(loc.t("team.myOrders"), color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                    if (perf.source == "live") Badge(loc.t("home.live"), Tone.WARNING)
                }
                Spacer(Modifier.size(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    Column {
                        Text("${perf.orders}", color = me.accent, fontWeight = FontWeight.Black, fontSize = 30.sp)
                        Text(perf.date, color = me.muted, fontSize = 11.sp)
                    }
                    perf.weekOrders?.let { wk ->
                        Column {
                            Text("$wk", color = me.text, fontWeight = FontWeight.Black, fontSize = 30.sp)
                            Text(loc.t("home.weekSummary"), color = me.muted, fontSize = 11.sp)
                        }
                    }
                }
                if (perf.source == "live") {
                    lm.liveKpiNotice?.takeIf { it.isNotBlank() }?.let {
                        Spacer(Modifier.size(8.dp))
                        Text(it, color = me.muted, fontSize = 11.sp)
                    }
                }
            }
        }

        // Apply / join / transfer (not for a current leader)
        if (!isLeader) {
            lm.applyURL?.takeIf { it.isNotBlank() }?.let { url ->
                ActionRow(
                    icon = if (inTeam) Icons.Filled.SwapHoriz else Icons.Filled.GroupAdd,
                    title = if (inTeam) loc.t("team.switch") else loc.t("team.apply"),
                    detail = loc.t("team.applyHint"),
                    trailing = Icons.Filled.ChevronRight,
                ) {
                    com.meponto.rider.data.Analytics.log("leader_apply_open")
                    onOpenWeb(url, loc.t("team.apply"))
                }
            }
        }

        // How pay works in this city
        lm.walletNotice?.takeIf { it.isNotBlank() }?.let { notice ->
            Panel {
                Row(verticalAlignment = Alignment.Top) {
                    Icon(Icons.Filled.Info, contentDescription = null, tint = me.muted, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(10.dp))
                    Text(notice, color = me.muted, fontSize = 12.sp)
                }
            }
        }
    }
}
