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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.GroupAdd
import androidx.compose.material.icons.filled.QrCode2
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalAuth
import com.meponto.rider.data.LocalStore
import com.meponto.rider.data.MallProduct
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.Panel
import com.meponto.rider.ui.components.QRSheet
import com.meponto.rider.ui.components.QuickActionTile
import com.meponto.rider.ui.components.Screen
import com.meponto.rider.ui.components.SectionHeader
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.Tone
import kotlinx.coroutines.delay

@Composable
fun MallScreen() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val auth = LocalAuth.current
    var toast by remember { mutableStateOf<String?>(null) }
    var showMyQR by remember { mutableStateOf(false) }
    var showInvite by remember { mutableStateOf(false) }

    LaunchedEffect(toast) {
        if (toast != null) {
            delay(1800)
            toast = null
        }
    }

    if (showMyQR) {
        QRSheet(
            title = loc.t("points.myQR"),
            caption = loc.t("points.myQRHint"),
            value = store.myQRPayload,
            onDismiss = { showMyQR = false },
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

    Box(Modifier.fillMaxSize()) {
        Screen(title = loc.t("mall.title")) {
            // Points balance
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(loc.t("mall.balance"), color = me.muted, fontSize = 12.sp)
                        Text("${store.pointsBalance} pts", color = me.accent, fontWeight = FontWeight.Bold, fontSize = 28.sp)
                    }
                    Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = me.accent, modifier = Modifier.size(34.dp))
                }
            }

            // Quick actions: My QR (partner scans) + Invite friends
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                QuickActionTile(
                    icon = Icons.Filled.QrCode2,
                    title = loc.t("points.myQR"),
                    detail = loc.t("points.myQRHint"),
                    tone = Tone.ACCENT,
                    modifier = Modifier.weight(1f),
                ) { if (auth.requireMember()) showMyQR = true }
                QuickActionTile(
                    icon = Icons.Filled.GroupAdd,
                    title = loc.t("points.invite"),
                    detail = loc.t("points.inviteHint"),
                    tone = Tone.OK,
                    modifier = Modifier.weight(1f),
                ) { if (auth.requireMember()) showInvite = true }
            }

            // 2-column grid
            store.products.chunked(2).forEach { rowItems ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    rowItems.forEach { product ->
                        ProductCard(
                            product = product,
                            modifier = Modifier.weight(1f),
                            onRedeem = {
                                if (auth.requireMember()) {
                                    toast = if (store.redeem(product)) {
                                        "${loc.t("mall.redeemed")}: ${product.name}"
                                    } else {
                                        loc.t("mall.insufficient")
                                    }
                                }
                            },
                        )
                    }
                    if (rowItems.size == 1) Spacer(Modifier.weight(1f))
                }
            }

            // 积分流水 / points statement
            Panel {
                SectionHeader(loc.t("points.statement"))
                Spacer(Modifier.size(12.dp))
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    store.pointsLedger.forEachIndexed { idx, e ->
                        Row(verticalAlignment = Alignment.Top) {
                            Column(Modifier.weight(1f)) {
                                Text(e.note, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                Text("${e.source} · ${e.status}", color = me.muted, fontSize = 12.sp)
                            }
                            Text(
                                "${if (e.isEarn) "+" else ""}${e.points} pts",
                                color = if (e.isEarn) me.ok else me.danger,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                            )
                        }
                        if (idx < store.pointsLedger.size - 1) {
                            Box(Modifier.fillMaxWidth().height(1.dp).background(me.line))
                        }
                    }
                }
            }

            Spacer(Modifier.size(8.dp))
        }

        // Toast
        toast?.let { msg ->
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 24.dp)
                    .clip(RoundedCornerShape(MeRadius.card))
                    .background(me.surface)
                    .border(1.dp, me.line, RoundedCornerShape(MeRadius.card))
                    .padding(horizontal = 16.dp, vertical = 10.dp)
            ) {
                Text(msg, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun ProductCard(
    product: MallProduct,
    modifier: Modifier = Modifier,
    onRedeem: () -> Unit,
) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val affordable = store.pointsBalance >= product.points && product.stock > 0

    Column(
        modifier = modifier
            .heightIn(min = 188.dp)
            .clip(RoundedCornerShape(MeRadius.card))
            .background(me.surface)
            .border(1.dp, me.line, RoundedCornerShape(MeRadius.card))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(product.icon, contentDescription = null, tint = me.accent, modifier = Modifier.size(24.dp))
        Text(product.name, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        Text(product.category, color = me.muted, fontSize = 11.sp)
        Spacer(Modifier.weight(1f))
        Text("${product.points} pts", color = me.text, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        Text(
            text = if (product.stock == 0) "—" else loc.t("mall.redeem"),
            color = if (affordable) me.accentInk else me.muted,
            fontWeight = FontWeight.SemiBold,
            fontSize = 12.sp,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeRadius.small))
                .background(if (affordable) me.accent else me.surfaceRaised)
                .clickable(enabled = affordable) { onRedeem() }
                .padding(vertical = 8.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}
