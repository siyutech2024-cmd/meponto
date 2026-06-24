package com.meponto.rider.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.screens.HomeScreen
import com.meponto.rider.ui.screens.MallScreen
import com.meponto.rider.ui.screens.MapScreen
import com.meponto.rider.ui.screens.ProfileScreen
import com.meponto.rider.ui.screens.ScanScreen
import com.meponto.rider.ui.screens.ShiftsScreen
import com.meponto.rider.ui.screens.WalletScreen
import com.meponto.rider.ui.theme.LocalMe

private enum class Overlay { NONE, SCAN, PROFILE }

private data class TabSpec(val labelKey: String, val icon: ImageVector)

@Composable
fun RootScaffold() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    var tab by remember { mutableStateOf(0) }
    var overlay by remember { mutableStateOf(Overlay.NONE) }

    val tabs = listOf(
        TabSpec("tab.home", Icons.Filled.Home),
        TabSpec("tab.wallet", Icons.Filled.AccountBalanceWallet),
        TabSpec("tab.shifts", Icons.Filled.CalendarMonth),
        TabSpec("tab.mall", Icons.Filled.ShoppingBag),
        TabSpec("tab.map", Icons.Filled.Map),
    )

    Box(Modifier.fillMaxSize().background(me.background)) {
        Scaffold(
            containerColor = me.background,
            bottomBar = {
                NavigationBar(containerColor = me.surface) {
                    tabs.forEachIndexed { index, spec ->
                        NavigationBarItem(
                            selected = tab == index,
                            onClick = { tab = index },
                            icon = { Icon(spec.icon, contentDescription = loc.t(spec.labelKey)) },
                            label = { Text(loc.t(spec.labelKey)) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = me.accentInk,
                                selectedTextColor = me.accent,
                                indicatorColor = me.accent,
                                unselectedIconColor = me.muted,
                                unselectedTextColor = me.muted,
                            ),
                        )
                    }
                }
            },
        ) { innerPadding ->
            Box(Modifier.padding(innerPadding).fillMaxSize().background(me.background)) {
                when (tab) {
                    0 -> HomeScreen(
                        onScan = { overlay = Overlay.SCAN },
                        onProfile = { overlay = Overlay.PROFILE },
                    )
                    1 -> WalletScreen()
                    2 -> ShiftsScreen()
                    3 -> MallScreen()
                    else -> MapScreen()
                }
            }
        }

        when (overlay) {
            Overlay.SCAN -> Box(Modifier.fillMaxSize().background(me.background)) {
                ScanScreen(onClose = { overlay = Overlay.NONE })
            }
            Overlay.PROFILE -> Box(Modifier.fillMaxSize().background(me.background)) {
                ProfileScreen(onClose = { overlay = Overlay.NONE })
            }
            Overlay.NONE -> {}
        }
    }
}
