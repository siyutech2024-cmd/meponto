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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.LocalGasStation
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.meponto.rider.data.LocalStore
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.Badge
import com.meponto.rider.ui.components.PrimaryButton
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.appBackground
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.Tone
import kotlinx.coroutines.delay
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker

/**
 * One marker on the rider map. Two kinds only:
 *  - Ponto (franchise service station) — check-in, pickup, leader base.
 *  - SERVICE partner (oficina / combustível / celular…) with a rider offer.
 * Supply-chain vendors are filtered out server-side and never shown.
 */
private data class MapPin(
    val id: String,
    val name: String,
    val subtitle: String,
    val address: String,
    val badge: String,
    val category: String,   // "" for pontos; raw partner category otherwise
    val lat: Double,
    val lng: Double,
    val isPonto: Boolean,
)

/** Category → glyph (fuel pump, workshop wrench, phone chip, generic store). */
private fun categoryIcon(pin: MapPin): ImageVector {
    if (pin.isPonto) return Icons.Filled.Place
    val c = pin.category.lowercase()
    return when {
        listOf("combust", "fuel", "gas", "posto").any { c.contains(it) } -> Icons.Filled.LocalGasStation
        listOf("ofic", "mec", "manut", "repair", "moto").any { c.contains(it) } -> Icons.Filled.Build
        listOf("cel", "phone", "chip", "telefon").any { c.contains(it) } -> Icons.Filled.PhoneAndroid
        else -> Icons.Filled.Storefront
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val context = LocalContext.current
    var selected by remember { mutableStateOf<MapPin?>(null) }
    var filter by remember { mutableStateOf<String?>(null) } // null=all, "" = pontos, else category
    var mapRef by remember { mutableStateOf<MapView?>(null) }
    var blink by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState()

    val allPins = buildList {
        store.servicePoints.forEach { p ->
            add(
                MapPin(
                    id = "ponto-${p.id}",
                    name = p.name,
                    subtitle = listOf(p.bairro, p.leader).filter { it.isNotBlank() }.joinToString(" · "),
                    address = p.address,
                    badge = "",
                    category = "",
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
                    category = p.category.ifBlank { "—" },
                    lat = p.latitude,
                    lng = p.longitude,
                    isPonto = false,
                )
            )
        }
    }
    val categories = allPins.filter { !it.isPonto }.map { it.category }.distinct().sorted()
    val pins = when (filter) {
        null -> allPins
        "" -> allPins.filter { it.isPonto }
        else -> allPins.filter { !it.isPonto && it.category == filter }
    }

    // Selected marker pulses (icon halo blinks ~2×/s) until deselected.
    LaunchedEffect(selected) {
        while (selected != null) {
            blink = !blink
            delay(450)
        }
        blink = false
    }
    // Follow the selection: glide the map to the pin.
    LaunchedEffect(selected) {
        selected?.let { p ->
            if (p.lat != 0.0 || p.lng != 0.0) {
                mapRef?.controller?.animateTo(GeoPoint(p.lat, p.lng), 16.5, 600L)
            }
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

    Column(Modifier.fillMaxSize().appBackground(me)) {
        Text(
            loc.t("map.title"),
            color = me.text,
            fontWeight = FontWeight.Black,
            fontSize = 32.sp,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
        )

        // Type filter chips: All · Stations · every service category (v4 chip
        // language — selected chip flips to ink with yellow label).
        Row(
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChipV4(loc.t("map.all"), filter == null) { filter = null; selected = null }
            FilterChipV4(loc.t("map.pontos"), filter == "") { filter = ""; selected = null }
            categories.forEach { cat ->
                FilterChipV4(cat, filter == cat) { filter = cat; selected = null }
            }
        }

        Spacer(Modifier.size(10.dp))

        if (pins.isEmpty()) {
            Box(
                modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(loc.t("empty.generic"), color = me.muted, fontSize = 13.sp)
            }
        } else {
            StreetMap(
                pins = pins,
                selectedId = selected?.id,
                blink = blink,
                onSelect = { selected = it },
                onMapReady = { mapRef = it },
                modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
            )
        }

        // Cards — scrolling snaps the map onto the first visible pin.
        val listState = rememberLazyListState()
        LaunchedEffect(pins) { if (pins.isNotEmpty()) listState.scrollToItem(0) }
        LaunchedEffect(listState, pins) {
            var last = -1
            while (true) {
                val idx = listState.firstVisibleItemIndex
                if (idx != last && idx in pins.indices) {
                    last = idx
                    val p = pins[idx]
                    if (p.lat != 0.0 || p.lng != 0.0) {
                        mapRef?.controller?.animateTo(GeoPoint(p.lat, p.lng), 15.5, 500L)
                    }
                }
                delay(220)
            }
        }
        LazyRow(
            state = listState,
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            itemsIndexed(pins, key = { _, p -> p.id }) { _, p ->
                Column(
                    modifier = Modifier
                        .width(220.dp)
                        .clip(RoundedCornerShape(MeRadius.card))
                        .background(me.surface)
                        .border(
                            if (selected?.id == p.id) 2.dp else 1.dp,
                            if (selected?.id == p.id) me.accent else me.line,
                            RoundedCornerShape(MeRadius.card),
                        )
                        .clickable { selected = p }
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(
                            categoryIcon(p),
                            contentDescription = null,
                            tint = if (p.isPonto) me.accent else me.ok,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(p.name, color = me.text, fontWeight = FontWeight.Black, fontSize = 14.sp, maxLines = 1)
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
                        categoryIcon(pin),
                        contentDescription = null,
                        tint = if (pin.isPonto) me.accent else me.ok,
                        modifier = Modifier.size(22.dp),
                    )
                    Column {
                        Text(pin.name, color = me.text, fontWeight = FontWeight.Black, fontSize = 20.sp)
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
private fun FilterChipV4(label: String, selected: Boolean, onClick: () -> Unit) {
    val me = LocalMe.current
    Text(
        label,
        color = if (selected) me.accent else me.textSoft,
        fontWeight = FontWeight.Black,
        fontSize = 12.sp,
        modifier = Modifier
            .clip(CircleShape)
            .background(if (selected) me.text else me.surface)
            .then(if (selected) Modifier else Modifier.border(1.dp, me.line, CircleShape))
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 7.dp),
    )
}

/** Circular pin bitmap; [halo] adds the blinking selection ring. */
private fun pinDrawable(
    context: android.content.Context,
    fill: Int,
    ink: Int,
    halo: Boolean,
): BitmapDrawable {
    val size = if (halo) 84 else 56
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val c = size / 2f
    if (halo) {
        paint.color = (fill and 0x00FFFFFF) or (0x55 shl 24)
        canvas.drawCircle(c, c, size / 2f - 2f, paint)
    }
    paint.color = android.graphics.Color.argb(70, 0, 0, 0)
    canvas.drawCircle(c, c + 2f, 24f, paint)
    paint.color = fill
    canvas.drawCircle(c, c, 24f, paint)
    paint.color = ink
    canvas.drawCircle(c, c, 9f, paint)
    return BitmapDrawable(context.resources, bmp)
}

/** Real street map (OpenStreetMap via osmdroid): pinch-zoom, pan, no API key. */
@Composable
private fun StreetMap(
    pins: List<MapPin>,
    selectedId: String?,
    blink: Boolean,
    onSelect: (MapPin) -> Unit,
    onMapReady: (MapView) -> Unit,
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
                    onMapReady(this)
                }
            },
            update = { map ->
                map.overlays.clear()
                located.forEach { p ->
                    val isSel = p.id == selectedId
                    val marker = Marker(map).apply {
                        position = GeoPoint(p.lat, p.lng)
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                        icon = if (p.isPonto) {
                            pinDrawable(map.context, accent, accentInk, halo = isSel && blink)
                        } else {
                            pinDrawable(map.context, ok, white, halo = isSel && blink)
                        }
                        title = p.name
                        setOnMarkerClickListener { _, _ -> onSelect(p); true }
                    }
                    map.overlays.add(marker)
                }
                if (map.tag != "fitted") {
                    map.tag = "fitted"
                    map.post {
                        if (located.size == 1) {
                            map.controller.setZoom(16.0)
                            map.controller.setCenter(GeoPoint(located[0].lat, located[0].lng))
                        } else {
                            val box = BoundingBox.fromGeoPointsSafe(located.map { GeoPoint(it.lat, it.lng) })
                            runCatching { map.zoomToBoundingBox(box.increaseByScale(1.35f), false) }
                        }
                    }
                }
                map.invalidate()
            },
        )
    }
}
