package com.meponto.rider.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalStore
import com.meponto.rider.data.Partner
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.Badge
import com.meponto.rider.ui.components.PrimaryButton
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.Tone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val context = LocalContext.current
    var selected by remember { mutableStateOf<Partner?>(null) }
    val sheetState = rememberModalBottomSheetState()

    fun navigate(p: Partner) {
        val uri = Uri.parse("geo:${p.latitude},${p.longitude}?q=${p.latitude},${p.longitude}(${Uri.encode(p.name)})")
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
    }

    Column(Modifier.fillMaxSize().background(me.background)) {
        Text(
            loc.t("map.title"),
            color = me.text,
            fontWeight = FontWeight.Bold,
            fontSize = 22.sp,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
        )

        // Stylized map canvas with partner pins (no API key required).
        if (store.partners.isEmpty()) {
            Box(
                modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(loc.t("empty.generic"), color = me.muted, fontSize = 13.sp)
            }
        } else {
            PartnerMap(
                partners = store.partners,
                onSelect = { selected = it },
                modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
            )
        }

        // Horizontal partner cards
        Row(
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            store.partners.forEach { p ->
                Column(
                    modifier = Modifier
                        .width(200.dp)
                        .clip(RoundedCornerShape(MeRadius.card))
                        .background(me.surface)
                        .border(1.dp, me.line, RoundedCornerShape(MeRadius.card))
                        .clickable { selected = p }
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(p.name, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                    Text("${p.neighborhood} · ${p.distance}", color = me.muted, fontSize = 11.sp)
                    Badge("${loc.t("map.discount")} R$ ${p.discountBRL}", Tone.OK)
                }
            }
        }
    }

    selected?.let { partner ->
        ModalBottomSheet(
            onDismissRequest = { selected = null },
            sheetState = sheetState,
            containerColor = me.background,
        ) {
            Column(
                Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Column {
                    Text(partner.name, color = me.text, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    Text(
                        "${partner.category} · ${partner.neighborhood} · ${partner.distance}",
                        color = me.muted,
                        fontSize = 14.sp,
                    )
                }
                Text(partner.services, color = me.textSoft, fontSize = 14.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Badge("${loc.t("map.discount")} R$ ${partner.discountBRL}", Tone.OK)
                    Badge("Partner +${partner.partnerPoints} pts", Tone.ACCENT)
                }
                PrimaryButton(title = loc.t("map.navigate"), icon = Icons.Filled.LocationOn) {
                    navigate(partner)
                }
            }
        }
    }
}

@Composable
private fun PartnerMap(
    partners: List<Partner>,
    onSelect: (Partner) -> Unit,
    modifier: Modifier = Modifier,
) {
    val me = LocalMe.current
    if (partners.isEmpty()) return

    val minLat = partners.minOf { it.latitude }
    val maxLat = partners.maxOf { it.latitude }
    val minLng = partners.minOf { it.longitude }
    val maxLng = partners.maxOf { it.longitude }
    val latSpan = (maxLat - minLat).takeIf { it > 0 } ?: 1.0
    val lngSpan = (maxLng - minLng).takeIf { it > 0 } ?: 1.0

    BoxWithConstraints(
        modifier = modifier
            .clip(RoundedCornerShape(MeRadius.card))
            .background(me.surfaceRaised)
            .border(BorderStroke(1.dp, me.line), RoundedCornerShape(MeRadius.card)),
    ) {
        val margin = 28.dp
        val w = maxWidth - margin * 2
        val h = maxHeight - margin * 2

        partners.forEach { p ->
            val fx = ((p.longitude - minLng) / lngSpan).toFloat()
            val fy = (1.0 - (p.latitude - minLat) / latSpan).toFloat()
            Box(
                modifier = Modifier
                    .offset(x = margin + w * fx, y = margin + h * fy)
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(me.accent)
                    .clickable { onSelect(p) },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.Build,
                    contentDescription = p.name,
                    tint = me.accentInk,
                    modifier = Modifier.size(16.dp),
                )
            }
        }

        Text(
            "São Paulo · Liberdade / Centro",
            color = me.muted,
            fontSize = 11.sp,
            modifier = Modifier.align(Alignment.BottomStart).padding(10.dp),
        )
    }
}
