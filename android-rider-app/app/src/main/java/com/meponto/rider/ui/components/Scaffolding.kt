package com.meponto.rider.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LedgerEntry
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.appBackground

/** Shared screen scaffold: branded background + large title + scrollable content. */
@Composable
fun Screen(title: String, content: @Composable ColumnScope.() -> Unit) {
    val me = LocalMe.current
    Column(Modifier.fillMaxSize().appBackground(me)) {
        Text(
            title,
            color = me.text,
            fontWeight = FontWeight.Black,
            fontSize = 32.sp,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 4.dp),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            content = content,
        )
    }
}

/** Compact top bar for full-screen overlays (Scan / Profile). */
@Composable
fun OverlayTopBar(title: String, onClose: () -> Unit) {
    val me = LocalMe.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, color = me.text, fontWeight = FontWeight.Black, fontSize = 20.sp)
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onClose) {
            Icon(Icons.Filled.Close, contentDescription = "Close", tint = me.text)
        }
    }
}

/** Ledger row used by the cash ledger (Home) and wallet statement. */
@Composable
fun LedgerRow(entry: LedgerEntry) {
    val me = LocalMe.current
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f)) {
            Text(entry.title, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Text(entry.detail, color = me.muted, fontSize = 12.sp)
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                entry.value,
                color = if (entry.value.startsWith("-")) me.danger else me.ok,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
            Badge(entry.status, entry.tone)
        }
    }
}
