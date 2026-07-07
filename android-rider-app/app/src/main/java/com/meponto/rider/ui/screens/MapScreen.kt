package com.meponto.rider.ui.screens

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
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
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import com.meponto.rider.data.LocalStore
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.Badge
import com.meponto.rider.ui.components.PrimaryButton
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.Tone

/**
 * One marker on the rider map. Two kinds only:
 *  - Ponto (franchise service station) — check-in, pickup, leader base.
 *  - SERVICE partner (oficina / combustível / celular…) with a rider offer.
 * Supply-chain vendors are filtered out server-side and never shown.
 */
private data class MapPin(
    val id: String,
    val name: String,
    val subtitle: String,   // bairro · leader | category · bairro
    val address: String,    // street address (ponto) or services (partner)
    val badge: String,      // "" or discount label
    val lat: Double,
    val lng: Double,
    val isPonto: Boolean,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val context = LocalContext.current
    var selected by remember { mutableStateOf<MapPin?>(null) }
    val sheetState = rememberModalBottomSheetState()

    val pins = buildList {
        store.servicePoints.forEach { p ->
            add(
                MapPin(
                    id = "ponto-${p.id}",
                    name = p.name,
                    subtitle = listOf(p.bairro, p.leader).filter { it.isNotBlank() }.joinToString(" · "),
                    address = p.address,
                    badge = "",
                    lat = p.latitude,
                    lng = p.longitude,
                    isPonto = true,
                )
            )
        }
        store.partners.forEach { p ->
            add(
                MapPin(
                    id = "partner-${p.id}",
                    name = p.name,
                    subtitle = listOf(p.category, p.neighborhood).filter { it.isNotBlank() }.joinToString(" · "),
                    address = p.services,
                    badge = if (p.discountBRL > 0) "${loc.t("map.discount")} R$ ${p.discountBRL}" else "",
                    lat = p.latitude,
                    lng = p.longitude,
                    isPonto = false,
                )
            )
        }
    }

    fun navigate(p: MapPin) {
        val label = Uri.encode(p.name)
        val uri = if (p.lat != 0.0 || p.lng != 0.0) {
            Uri.parse("geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}($label)")
        } else {
            Uri.parse("geo:0,0?q=${Uri.encode(p.address.ifBlank { p.name })}")
        }
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
    }

    Column(Modifier.fillMaxSize().background(me.background)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
        ) {
            Text(loc.t("map.title"), color = me.text, fontWeight = FontWeight.Bold, fontSize = 22.sp, modifier = Modifier.weight(1f))
            LegendChip(Icons.Filled.Place, loc.t("map.pontos"), Tone.ACCENT)
            Spacer(Modifier.width(6.dp))
            LegendChip(Icons.Filled.Build, loc.t("map.partners"), Tone.OK)
        }

        if (pins.isEmpty()) {
            Box(
                modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(loc.t("empty.generic"), color = me.muted, fontSize = 13.sp)
            }
        } else {
            PinMap(
                pins = pins,
                onSelect = { selected = it },
                modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
            )
        }

        // Cards: pontos first, then service partners.
        Row(
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            pins.forEach { p ->
                Column(
                    modifier = Modifier
                        .width(220.dp)
                        .clip(RoundedCornerShape(MeRadius.card))
                        .background(me.surface)
                        .border(1.dp, me.line, RoundedCornerShape(MeRadius.card))
                        .clickable { selected = p }
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(
                            if (p.isPonto) Icons.Filled.Place else Icons.Filled.Build,
                            contentDescription = null,
                            tint = if (p.isPonto) me.accent else me.ok,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(p.name, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                    }
                    Text(p.subtitle.ifBlank { "—" }, color = me.muted, fontSize = 11.sp, maxLines = 1)
                    if (p.badge.isNotBlank()) {
                        Badge(p.badge, Tone.OK)
                    } else {
                        Text(p.address.ifBlank { "—" }, color = me.textSoft, fontSize = 12.sp, maxLines = 2)
                    }
                }
            }
        }
    }

    selected?.let { pin ->
        ModalBottomSheet(
            onDismissRequest = { selected = null },
            sheetState = sheetState,
            containerColor = me.background,
        ) {
            Column(
                Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(
                        if (pin.isPonto) Icons.Filled.Place else Icons.Filled.Build,
                        contentDescription = null,
                        tint = if (pin.isPonto) me.accent else me.ok,
                        modifier = Modifier.size(22.dp),
                    )
                    Column {
                        Text(pin.name, color = me.text, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                        Text(pin.subtitle.ifBlank { "—" }, color = me.muted, fontSize = 14.sp)
                    }
                }
                if (pin.address.isNotBlank()) {
                    Text(pin.address, color = me.textSoft, fontSize = 15.sp)
                }
                if (pin.badge.isNotBlank()) {
                    Badge(pin.badge, Tone.OK)
                }
                PrimaryButton(title = loc.t("map.navigate"), icon = Icons.Filled.LocationOn) {
                    navigate(pin)
                }
            }
        }
    }
}

@Composable
private fun LegendChip(icon: ImageVector, label: String, tone: Tone) {
    val me = LocalMe.current
    val color = when (tone) {
        Tone.OK -> me.ok
        else -> me.accent
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .clip(CircleShape)
            .background(color.copy(alpha = 0.14f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(12.dp))
        Text(label, color = color, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
    }
}

/** Circular pin bitmap (brand yellow for pontos, green for partners). */
private fun pinDrawable(context: android.content.Context, fill: Int, ink: Int): BitmapDrawable {
    val size = 56
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = android.graphics.Color.argb(70, 0, 0, 0)
    canvas.drawCircle(size / 2f, size / 2f + 2f, size / 2f - 4f, paint)
    paint.color = fill
    canvas.drawCircle(size / 2f, size / 2f, size / 2f - 4f, paint)
    paint.color = ink
    canvas.drawCircle(size / 2f, size / 2f, size / 6f, paint)
    return BitmapDrawable(context.resources, bmp)
}

/**
 * REAL street map (OpenStreetMap tiles via osmdroid): streets, blocks and
 * names at full detail — pinch-zoom/pan, no API key, no Play dependency.
 */
@Composable
private fun PinMap(
    pins: List<MapPin>,
    onSelect: (MapPin) -> Unit,
    modifier: Modifier = Modifier,
) {
    val me = LocalMe.current
    val located = pins.filter { it.lat != 0.0 || it.lng != 0.0 }
    if (located.isEmpty()) return

    val accent = me.accent.toArgb()
    val accentInk = me.accentInk.toArgb()
    val ok = me.ok.toArgb()
    val white = android.graphics.Color.WHITE

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(MeRadius.card))
            .border(BorderStroke(1.dp, me.line), RoundedCornerShape(MeRadius.card)),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                Configuration.getInstance().userAgentValue = ctx.packageName
                MapView(ctx).apply {
                    setTileSource(TileSourceFactory.MAPNIK)
                    setMultiTouchControls(true)
                    zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
                }
            },
            update = { map ->
                map.overlays.clear()
                located.forEach { p ->
                    val marker = Marker(map).apply {
                        position = GeoPoint(p.lat, p.lng)
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                        icon = if (p.isPonto) {
                            pinDrawable(map.context, accent, accentInk)
                        } else {
                            pinDrawable(map.context, ok, white)
                        }
                        title = p.name
                        setOnMarkerClickListener { _, _ -> onSelect(p); true }
                    }
                    map.overlays.add(marker)
                }
                // Fit every pin with breathing room once the view is laid out.
                map.post {
                    if (located.size == 1) {
                        map.controller.setZoom(16.0)
                        map.controller.setCenter(GeoPoint(located[0].lat, located[0].lng))
                    } else {
                        val box = BoundingBox.fromGeoPointsSafe(located.map { GeoPoint(it.lat, it.lng) })
                        runCatching { map.zoomToBoundingBox(box.increaseByScale(1.35f), false) }
                    }
                }
                map.invalidate()
            },
        )
    }
}
