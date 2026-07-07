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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.GroupAdd
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.meponto.rider.data.LocalAuth
import com.meponto.rider.data.LocalStore
import com.meponto.rider.data.MallProduct
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.Badge
import com.meponto.rider.ui.components.Panel
import com.meponto.rider.ui.components.PrimaryButton
import com.meponto.rider.ui.components.QRSheet
import com.meponto.rider.ui.components.QuickActionTile
import com.meponto.rider.ui.components.Screen
import com.meponto.rider.ui.components.SectionHeader
import com.meponto.rider.ui.components.WaveMotif
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.Tone
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MallScreen() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val auth = LocalAuth.current
    var toast by remember { mutableStateOf<String?>(null) }
    var showMyQR by remember { mutableStateOf(false) }
    var showInvite by remember { mutableStateOf(false) }
    var detail by remember { mutableStateOf<MallProduct?>(null) }

    fun redeem(product: MallProduct, pickupStoreId: String? = null) {
        if (auth.requireMember()) {
            toast = if (store.redeem(product, pickupStoreId)) {
                "${loc.t("mall.redeemed")}: ${product.name}"
            } else {
                loc.t("mall.insufficient")
            }
            detail = null
        }
    }

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
            // Points balance — sunset-gradient hero card with the wave motif.
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(MeRadius.hero))
                    .background(Brush.linearGradient(me.pointsGradient)),
            ) {
                WaveMotif(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(180.dp, 90.dp),
                    alpha = 0.2f,
                )
                Row(
                    Modifier.fillMaxWidth().padding(18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            loc.t("mall.balance"),
                            color = Color.White.copy(alpha = 0.85f),
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp,
                        )
                        Text(
                            "${store.pointsBalance} pts",
                            color = Color.White,
                            fontWeight = FontWeight.Black,
                            fontSize = 32.sp,
                        )
                    }
                    Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = Color.White, modifier = Modifier.size(34.dp))
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

            // 2-column grid — tap the card for details, tap the button to redeem.
            store.products.chunked(2).forEach { rowItems ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    rowItems.forEach { product ->
                        ProductCard(
                            product = product,
                            modifier = Modifier.weight(1f),
                            onOpen = { detail = product },
                            onRedeem = { redeem(product) },
                        )
                    }
                    if (rowItems.size == 1) Spacer(Modifier.weight(1f))
                }
            }

            // 商城消息 / arrival + pickup notices (auto-marks read on view).
            if (store.mallMessages.isNotEmpty()) {
                LaunchedEffect(Unit) { store.markMessagesRead() }
                Panel {
                    SectionHeader(loc.t("mall.messages"))
                    Spacer(Modifier.size(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        store.mallMessages.forEach { msg ->
                            Row(verticalAlignment = Alignment.Top) {
                                Column(Modifier.weight(1f)) {
                                    Text(msg.title, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                    Text(msg.body, color = me.muted, fontSize = 12.sp)
                                }
                                Text(msg.time, color = me.muted, fontSize = 11.sp)
                            }
                        }
                    }
                }
            }

            // 优惠券 / eligible coupons (best one auto-applies at redemption).
            if (store.coupons.isNotEmpty()) {
                Panel {
                    SectionHeader(loc.t("mall.coupons"))
                    Spacer(Modifier.size(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        store.coupons.forEach { c ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(c.title, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                    Text(
                                        buildString {
                                            if (c.minPoints > 0) append("≥ ${c.minPoints} pts")
                                            if (c.expiresAt.isNotBlank()) {
                                                if (isNotEmpty()) append(" · ")
                                                append(c.expiresAt)
                                            }
                                        },
                                        color = me.muted,
                                        fontSize = 11.sp,
                                    )
                                }
                                Badge(c.valueLabel, Tone.ACCENT)
                            }
                        }
                        Text(loc.t("mall.couponAuto"), color = me.muted, fontSize = 11.sp)
                    }
                }
            }

            // 我的订单 / my redemption orders — status, pickup point, voucher.
            if (store.mallOrders.isNotEmpty()) {
                Panel {
                    SectionHeader(loc.t("mall.orders"))
                    Spacer(Modifier.size(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        store.mallOrders.forEachIndexed { idx, order ->
                            Row(verticalAlignment = Alignment.Top) {
                                Column(Modifier.weight(1f)) {
                                    Text(order.productName, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                    Text(
                                        buildString {
                                            append(order.createdAt)
                                            if (order.pickupStoreName.isNotBlank()) append(" · ${loc.t("order.pickupAt")}: ${order.pickupStoreName}")
                                        },
                                        color = me.muted,
                                        fontSize = 11.sp,
                                    )
                                    if (order.voucherCode.isNotBlank()) {
                                        Text(
                                            "${loc.t("order.voucher")}: ${order.voucherCode}",
                                            color = me.accent,
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 12.sp,
                                        )
                                    }
                                }
                                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text("-${order.pointsSpent} pts", color = me.danger, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                    Badge(
                                        order.status,
                                        when (order.status) {
                                            "fulfilled", "picked_up", "arrived" -> Tone.OK
                                            "cancelled" -> Tone.DANGER
                                            else -> Tone.WARNING
                                        },
                                    )
                                }
                            }
                            if (idx < store.mallOrders.size - 1) {
                                Box(Modifier.fillMaxWidth().height(1.dp).background(me.line))
                            }
                        }
                    }
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

        // Product detail sheet: image, description, stock, redeem.
        detail?.let { product ->
            val affordable = store.pointsBalance >= product.points && product.stock > 0
            // Physical goods for riders WITHOUT a locked home station need an
            // explicit pickup Ponto; virtual goods and home-station riders skip it.
            val needsPickup = !product.isVirtual &&
                store.profile.ponto.isBlank() &&
                store.servicePoints.isNotEmpty()
            var pickupId by remember { mutableStateOf<String?>(null) }
            ModalBottomSheet(
                onDismissRequest = { detail = null },
                containerColor = me.background,
            ) {
                Column(
                    Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    ProductImage(product, Modifier.fillMaxWidth().height(180.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(product.name, color = me.text, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                        Text(product.category, color = me.muted, fontSize = 13.sp)
                    }
                    if (product.description.isNotBlank()) {
                        Text(product.description, color = me.textSoft, fontSize = 14.sp)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${product.points} pts", color = me.accent, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                        if (product.cashPriceBRL > 0) {
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "+ R$ ${String.format("%.2f", product.cashPriceBRL).replace('.', ',')}",
                                color = me.warning,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        Text("${loc.t("mall.stock")}: ${product.stock}", color = me.muted, fontSize = 13.sp)
                    }
                    if (product.cashPriceBRL > 0) {
                        Text(loc.t("mall.cashPart"), color = me.muted, fontSize = 12.sp)
                    }
                    if (needsPickup) {
                        Text(loc.t("mall.pickupChoose"), color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            store.servicePoints.take(6).forEach { sp ->
                                val sel = pickupId == sp.id
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(MeRadius.small))
                                        .background(if (sel) me.accent.copy(alpha = 0.18f) else me.surfaceRaised)
                                        .border(
                                            1.dp,
                                            if (sel) me.accent else me.line,
                                            RoundedCornerShape(MeRadius.small),
                                        )
                                        .clickable { pickupId = sp.id }
                                        .padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(sp.name, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                        Text(
                                            listOf(sp.bairro, sp.address).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "—" },
                                            color = me.muted,
                                            fontSize = 11.sp,
                                            maxLines = 1,
                                        )
                                    }
                                    if (sel) {
                                        Text("✓", color = me.accent, fontWeight = FontWeight.Black, fontSize = 14.sp)
                                    }
                                }
                            }
                        }
                    }
                    PrimaryButton(
                        title = if (product.stock == 0) "—" else loc.t("mall.redeem"),
                        enabled = affordable && (!needsPickup || pickupId != null),
                    ) { redeem(product, pickupId) }
                }
            }
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
private fun ProductImage(product: MallProduct, modifier: Modifier = Modifier) {
    val me = LocalMe.current
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(MeRadius.small))
            .background(me.surfaceRaised),
        contentAlignment = Alignment.Center,
    ) {
        if (product.imageUrl != null) {
            AsyncImage(
                model = product.imageUrl,
                contentDescription = product.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Icon(product.icon, contentDescription = null, tint = me.accent, modifier = Modifier.size(30.dp))
        }
    }
}

@Composable
private fun ProductCard(
    product: MallProduct,
    modifier: Modifier = Modifier,
    onOpen: () -> Unit,
    onRedeem: () -> Unit,
) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val affordable = store.pointsBalance >= product.points && product.stock > 0

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(MeRadius.card))
            .background(me.surface)
            .border(1.dp, me.line, RoundedCornerShape(MeRadius.card))
            .clickable { onOpen() }
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ProductImage(product, Modifier.fillMaxWidth().height(96.dp))
        Text(product.name, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 2)
        Text(product.category, color = me.muted, fontSize = 11.sp, maxLines = 1)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${product.points} pts", color = me.accent, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Spacer(Modifier.weight(1f))
            Text(
                "${loc.t("mall.stock")}: ${product.stock}",
                color = if (product.stock > 0) me.muted else me.danger,
                fontSize = 11.sp,
            )
        }
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
