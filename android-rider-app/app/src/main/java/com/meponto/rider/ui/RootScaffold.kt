package com.meponto.rider.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalStore
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.push.PushNavigator
import com.meponto.rider.ui.screens.HomeScreen
import com.meponto.rider.ui.screens.MallScreen
import com.meponto.rider.ui.screens.MapScreen
import com.meponto.rider.ui.screens.ProfileScreen
import com.meponto.rider.ui.screens.ScanScreen
import com.meponto.rider.ui.screens.ShiftsScreen
import com.meponto.rider.ui.screens.WalletScreen
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.appBackground

private enum class Overlay { NONE, SCAN, PROFILE }

private data class TabSpec(val labelKey: String, val icon: ImageVector)

@Composable
fun RootScaffold() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    var tab by remember { mutableStateOf(0) }
    var overlay by remember { mutableStateOf(Overlay.NONE) }

    // Notification tap → jump to the tab matching the pushed URL.
    val pushedUrl = PushNavigator.pendingUrl.value
    LaunchedEffect(pushedUrl) {
        if (pushedUrl != null) {
            tab = PushNavigator.tabFor(pushedUrl)
            overlay = Overlay.NONE
            PushNavigator.clear()
        }
    }

    val tabs = listOf(
        TabSpec("tab.home", Icons.Filled.Home),
        TabSpec("tab.wallet", Icons.Filled.AccountBalanceWallet),
        TabSpec("tab.shifts", Icons.Filled.CalendarMonth),
        TabSpec("tab.mall", Icons.Filled.ShoppingBag),
        TabSpec("tab.map", Icons.Filled.Map),
    )

    Box(Modifier.fillMaxSize().appBackground(me)) {
        Scaffold(
            containerColor = me.background,
            bottomBar = {
                // v4 nav, custom-built (M3 NavigationBar is too tall and its
                // icon/label rhythm fights the spec). Day: ink bar, 24dp top
                // radius. Noite: floating translucent pill. Active item: yellow
                // icon + tiny uppercase label, spacing tight and even.
                val navBg = if (me.isDark) me.surface.copy(alpha = 0.94f) else me.text
                val inactive = if (me.isDark) me.muted else Color(0xFF6C7568)
                val navShape = if (me.isDark) RoundedCornerShape(999.dp)
                else RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
                Box(
                    modifier = if (me.isDark) {
                        Modifier
                            .navigationBarsPadding()
                            .padding(start = 14.dp, end = 14.dp, bottom = 12.dp)
                    } else {
                        Modifier
                    }
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(navShape)
                            .then(if (me.isDark) Modifier.border(1.dp, me.line, navShape) else Modifier)
                            .background(navBg)
                            .then(if (me.isDark) Modifier else Modifier.navigationBarsPadding())
                            .padding(top = 10.dp, bottom = if (me.isDark) 10.dp else 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        tabs.forEachIndexed { index, spec ->
                            val active = tab == index
                            val tint = if (active) me.accent else inactive
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(14.dp))
                                    .clickable { tab = index }
                                    .padding(vertical = 2.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Icon(
                                    spec.icon,
                                    contentDescription = loc.t(spec.labelKey),
                                    tint = tint,
                                    modifier = Modifier.size(22.dp),
                                )
                                Spacer(Modifier.height(3.dp))
                                Text(
                                    loc.t(spec.labelKey).uppercase(),
                                    color = tint,
                                    fontWeight = FontWeight.Black,
                                    fontSize = 9.sp,
                                    letterSpacing = 0.8.sp,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
            },
        ) { innerPadding ->
            Box(Modifier.padding(innerPadding).fillMaxSize().appBackground(me)) {
                when (tab) {
                    0 -> HomeScreen(
                        onScan = { overlay = Overlay.SCAN },
                        onProfile = { overlay = Overlay.PROFILE },
                        onOpenMall = { tab = 3 }, // points statement lives on the Mall tab
                    )
                    1 -> WalletScreen()
                    2 -> ShiftsScreen()
                    3 -> MallScreen()
                    else -> MapScreen()
                }
            }
        }

        when (overlay) {
            Overlay.SCAN -> Box(Modifier.fillMaxSize().appBackground(me)) {
                ScanScreen(onClose = { overlay = Overlay.NONE })
            }
            Overlay.PROFILE -> Box(Modifier.fillMaxSize().appBackground(me)) {
                ProfileScreen(onClose = { overlay = Overlay.NONE })
            }
            Overlay.NONE -> {}
        }

        // Global notice: WHY a write was refused (tier gate, pending withdrawal,
        // already checked in…). Auto-dismisses; backend messages are pt-BR.
        store.notice?.let { msg ->
            LaunchedEffect(msg) {
                kotlinx.coroutines.delay(3200)
                store.clearNotice()
            }
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 96.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(me.danger.copy(alpha = if (me.isDark) 0.22f else 0.12f))
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
                Text(msg, color = me.danger, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            }
        }
    }
}
