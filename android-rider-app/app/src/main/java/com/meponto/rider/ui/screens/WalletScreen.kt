package com.meponto.rider.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowCircleDown
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalAuth
import com.meponto.rider.data.LocalStore
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.LedgerRow
import com.meponto.rider.ui.components.LoginPromptCard
import com.meponto.rider.ui.components.PagedSection
import com.meponto.rider.ui.components.Panel
import com.meponto.rider.ui.components.PrimaryButton
import com.meponto.rider.ui.components.ProgressBar
import com.meponto.rider.ui.components.Screen
import com.meponto.rider.ui.components.SectionHeader
import com.meponto.rider.ui.theme.LocalMe

private fun brl(v: Double): String = "R$ " + String.format("%.2f", v).replace('.', ',')

@Composable
fun WalletScreen() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val auth = LocalAuth.current
    var showWithdrawAlert by remember { mutableStateOf(false) }

    Screen(title = loc.t("wallet.title")) {
        if (!auth.isMember) {
            LoginPromptCard(message = loc.t("auth.gatedAction"))
        }
        // Balance panel
        Panel {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Column {
                    Text(loc.t("wallet.available"), color = me.muted, fontSize = 12.sp)
                    Text(brl(store.wallet.available), color = me.text, fontWeight = FontWeight.Bold, fontSize = 34.sp)
                }
                Column {
                    Text(loc.t("wallet.pending"), color = me.muted, fontSize = 12.sp)
                    Text(brl(store.wallet.pending), color = me.warning, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                }
                PrimaryButton(
                    title = loc.t("wallet.withdraw"),
                    icon = Icons.Filled.ArrowCircleDown,
                    enabled = store.wallet.available > 0 && (!auth.isMember || store.profile.isComplete),
                ) {
                    if (!auth.requireMember()) return@PrimaryButton
                    store.requestWithdraw()
                    showWithdrawAlert = true
                }
                if (auth.isMember && !store.profile.isComplete) {
                    Text(loc.t("wallet.completeProfile"), color = me.warning, fontSize = 12.sp)
                }
            }
        }

        // Weekly goal
        Panel {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(loc.t("wallet.weeklyGoal"), color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                    Text("${store.wallet.weeklyGoalProgress}%", color = me.accent, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                }
                ProgressBar(store.wallet.weeklyGoalProgress / 100f)
            }
        }

        // Statement — newest first (by event time), entries WITHOUT a real
        // amount are hidden ("没有金额的日期就不显示"), and the list is paged so
        // a long history doesn't become an endless wall (每天 T+1 同步累积).
        Panel {
            SectionHeader(loc.t("wallet.statement"))
            Spacer(Modifier.size(12.dp))
            val entries = store.cashLedger
                .filter { it.value.isNotBlank() && it.value.any { c -> c.isDigit() } && it.value.trimStart('+', '-', 'R', '$', ' ') != "0,00" }
                .sortedByDescending { it.at.ifBlank { it.detail } }
            if (entries.isEmpty()) {
                Text(loc.t("empty.generic"), color = me.muted, fontSize = 13.sp)
            } else {
                PagedSection(items = entries, pageSize = 8) { e -> LedgerRow(e) }
            }
        }
    }

    if (showWithdrawAlert) {
        AlertDialog(
            onDismissRequest = { showWithdrawAlert = false },
            confirmButton = {
                TextButton(onClick = { showWithdrawAlert = false }) { Text(loc.t("common.done")) }
            },
            title = { Text(loc.t("wallet.withdraw")) },
            text = { Text("PIX • ${loc.t("wallet.pending")}: ${brl(store.wallet.pending)}") },
        )
    }
}
