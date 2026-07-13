package com.meponto.rider.ui.screens

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.Cake
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.meponto.rider.data.LocalStore
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.OverlayTopBar
import com.meponto.rider.ui.components.QRCodeView
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.appBackground
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

// Avatar files are namespaced per user (see avatarKey below) so a device shared
// by different riders never leaks a previous user's photo. The untouched
// original is kept alongside so "cartoonize" is reversible on-device.
private const val AVATAR_PREFIX = "member_avatar"

/**
 * Decode an image upright and near the avatar target size: many phones store
 * camera photos rotated with an EXIF orientation tag (ignored by plain
 * BitmapFactory → sideways avatars), and gallery originals can be 4000px+
 * (downsampled here so we never hold a huge bitmap).
 */
private fun decodeUpright(context: Context, uri: Uri): Bitmap? {
    val resolver = context.contentResolver
    // Bounds-only pass → inSampleSize keeps the decode near the 640px target.
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 640) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    val bmp = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null
    val orientation = resolver.openInputStream(uri)?.use { stream ->
        runCatching { ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
            .getOrDefault(ExifInterface.ORIENTATION_NORMAL)
    } ?: ExifInterface.ORIENTATION_NORMAL
    val degrees = when (orientation) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
        else -> 0f
    }
    if (degrees == 0f) return bmp
    val matrix = Matrix().apply { postRotate(degrees) }
    return Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, matrix, true)
}

/**
 * 卡通化 / Cartoon filter — pure on-device (no network, photo never leaves the
 * phone, same privacy promise as the avatar itself): posterized "cel" colors
 * plus a dark outline where the luminance gradient is steep.
 */
private fun cartoonize(src: Bitmap): Bitmap {
    val w = src.width
    val h = src.height
    val pixels = IntArray(w * h)
    src.getPixels(pixels, 0, w, 0, 0, w, h)
    val lum = IntArray(w * h)
    for (i in pixels.indices) {
        val p = pixels[i]
        lum[i] = (((p shr 16) and 0xFF) * 299 + ((p shr 8) and 0xFF) * 587 + (p and 0xFF) * 114) / 1000
    }
    fun quantize(v: Int) = ((v / 52) * 52 + 26).coerceAtMost(255)
    val out = IntArray(w * h)
    for (y in 0 until h) {
        for (x in 0 until w) {
            val i = y * w + x
            val p = pixels[i]
            var r = quantize((p shr 16) and 0xFF)
            var g = quantize((p shr 8) and 0xFF)
            var b = quantize(p and 0xFF)
            // Forward-difference edge on luminance → comic-style dark line.
            val gx = if (x + 1 < w) lum[i + 1] - lum[i] else 0
            val gy = if (y + 1 < h) lum[i + w] - lum[i] else 0
            if (gx * gx + gy * gy > 900) {
                r = r * 3 / 10; g = g * 3 / 10; b = b * 3 / 10
            }
            out[i] = (p and 0xFF000000.toInt()) or (r shl 16) or (g shl 8) or b
        }
    }
    return Bitmap.createBitmap(out, w, h, Bitmap.Config.ARGB_8888)
}

/** Tier-driven card art: each level gets its own gradient + accent. */
private data class CardArt(val brush: Brush, val chipBg: Color, val chipInk: Color, val stars: Int)

private fun artFor(tierKey: String): CardArt = when (tierKey) {
    "diamante" -> CardArt(
        Brush.linearGradient(listOf(Color(0xFF2E1D5B), Color(0xFF6C3BFF), Color(0xFF4DE0E0))),
        Color(0xFF4DE0E0), Color(0xFF0B1030), 5,
    )
    "ouro" -> CardArt(
        Brush.linearGradient(listOf(Color(0xFF7A4E00), Color(0xFFFFC400), Color(0xFFFFE58A))),
        Color(0xFFFFF3C2), Color(0xFF5A3A00), 4,
    )
    "prata" -> CardArt(
        Brush.linearGradient(listOf(Color(0xFF4C5560), Color(0xFF9AA7B5), Color(0xFFD9E0E8))),
        Color(0xFFEFF3F7), Color(0xFF39424C), 3,
    )
    "bronze" -> CardArt(
        Brush.linearGradient(listOf(Color(0xFF4A2F10), Color(0xFFB4712E), Color(0xFFE0A662))),
        Color(0xFFF3DCC0), Color(0xFF4A2F10), 2,
    )
    else -> CardArt(
        Brush.linearGradient(listOf(Color(0xFF0B5C3B), Color(0xFF117A4F), Color(0xFF1FA36A))),
        Color(0xFFFFC400), Color(0xFF10240F), 1,
    )
}

/**
 * 会员名片 / Cartão de membro — a shareable virtual pass: the rider's photo
 * avatar (camera or gallery, stored on-device only), tier-styled art,
 * identity rows (99 ID / ponto / birthday) and the member QR that partners
 * scan for discounts.
 */
@Composable
fun MemberCardScreen(onClose: () -> Unit) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val context = LocalContext.current

    val scope = rememberCoroutineScope()

    // Per-user avatar files (99 ID → phone → "guest"), so switching accounts on
    // one device never shows the previous rider's photo.
    val avatarKey = remember(store.profile.ninetyNineId, store.profile.phone) {
        store.profile.ninetyNineId.ifBlank { store.profile.phone }.ifBlank { "guest" }
            .filter { it.isLetterOrDigit() }.ifBlank { "guest" }
    }
    val avatarFile = remember(avatarKey) { File(context.filesDir, "${AVATAR_PREFIX}_$avatarKey.jpg") }
    val avatarOrigFile = remember(avatarKey) { File(context.filesDir, "${AVATAR_PREFIX}_${avatarKey}_orig.jpg") }
    var avatarVersion by remember { mutableIntStateOf(0) }
    var cartoonBusy by remember { mutableStateOf(false) }
    val avatarBitmap: Bitmap? = remember(avatarVersion, avatarKey) {
        if (avatarFile.exists()) runCatching { BitmapFactory.decodeFile(avatarFile.absolutePath) }.getOrNull() else null
    }
    // Cartoon mode is on when the untouched original is parked alongside.
    val isCartoon = remember(avatarVersion, avatarKey) { avatarOrigFile.exists() }
    fun saveAvatar(bmp: Bitmap) {
        runCatching {
            val scale = minOf(1f, 640f / maxOf(bmp.width, bmp.height))
            val out = if (scale < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true) else bmp
            avatarFile.outputStream().use { out.compress(Bitmap.CompressFormat.JPEG, 88, it) }
            // A fresh photo resets cartoon mode.
            avatarOrigFile.delete()
            avatarVersion += 1
        }
    }
    fun toggleCartoon() {
        if (cartoonBusy) return
        cartoonBusy = true
        scope.launch {
            withContext(Dispatchers.Default) {
                runCatching {
                    val avatar = avatarFile
                    val orig = avatarOrigFile
                    if (orig.exists()) {
                        // Restore: original back in place, drop the backup.
                        orig.copyTo(avatar, overwrite = true)
                        orig.delete()
                    } else if (avatar.exists()) {
                        BitmapFactory.decodeFile(avatar.absolutePath)?.let { bmp ->
                            avatar.copyTo(orig, overwrite = true)
                            avatar.outputStream().use { cartoonize(bmp).compress(Bitmap.CompressFormat.JPEG, 88, it) }
                        }
                    }
                }
            }
            avatarVersion += 1
            cartoonBusy = false
        }
    }
    // Full-res capture (TakePicturePreview only returns a low-res thumbnail):
    // the camera writes to a FileProvider-backed cache file, decoded upright.
    val cameraTarget = remember { File(File(context.cacheDir, "camera").apply { mkdirs() }, "avatar_capture.jpg") }
    val cameraUri = remember { FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", cameraTarget) }
    val takePhoto = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        if (ok) {
            runCatching { decodeUpright(context, cameraUri) }.getOrNull()?.let { saveAvatar(it) }
            cameraTarget.delete()
        }
    }
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri != null) {
            runCatching { decodeUpright(context, uri) }.getOrNull()?.let { saveAvatar(it) }
        }
    }

    val tierKey = store.serverTier?.tier ?: "member"
    val art = artFor(tierKey)
    val tierLabel = store.serverTier?.label ?: "Membro"
    val name = store.profile.name.ifBlank { store.riderName }

    // Share the rendered card as a PNG: the card records itself into a
    // GraphicsLayer on every draw; sharing rasterizes that layer to a
    // FileProvider-backed cache file and opens the system share sheet.
    val cardLayer = rememberGraphicsLayer()
    var shareBusy by remember { mutableStateOf(false) }
    val shareTitle = loc.t("card.share")
    fun shareCard() {
        if (shareBusy) return
        shareBusy = true
        scope.launch {
            runCatching {
                val bmp = cardLayer.toImageBitmap().asAndroidBitmap()
                val file = File(File(context.cacheDir, "share").apply { mkdirs() }, "member_card.png")
                withContext(Dispatchers.IO) {
                    file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                }
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "image/png"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(Intent.createChooser(send, shareTitle))
            }
            shareBusy = false
        }
    }

    Column(Modifier.fillMaxSize().appBackground(me)) {
        OverlayTopBar(title = loc.t("card.title"), onClose = onClose)
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ---- The pass itself ----
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .drawWithContent {
                        cardLayer.record { this@drawWithContent.drawContent() }
                        drawLayer(cardLayer)
                    }
                    .clip(RoundedCornerShape(MeRadius.hero))
                    .background(art.brush)
                    .padding(22.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("MePonto PASS", color = Color.White.copy(alpha = 0.8f), fontWeight = FontWeight.Black, fontSize = 12.sp, letterSpacing = 2.sp)
                    Spacer(Modifier.weight(1f))
                    Box(
                        Modifier.clip(RoundedCornerShape(999.dp)).background(art.chipBg).padding(horizontal = 12.dp, vertical = 5.dp),
                    ) {
                        Text(tierLabel.uppercase(), color = art.chipInk, fontWeight = FontWeight.Black, fontSize = 11.sp, letterSpacing = 1.sp)
                    }
                }

                // Avatar — photo or initial disc, white ring.
                Box(
                    modifier = Modifier
                        .size(96.dp)
                        .clip(CircleShape)
                        .border(3.dp, Color.White.copy(alpha = 0.9f), CircleShape)
                        .background(Color.White.copy(alpha = 0.18f)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (avatarBitmap != null) {
                        Image(
                            bitmap = avatarBitmap.asImageBitmap(),
                            contentDescription = name,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        Text(name.trim().take(1).uppercase().ifBlank { "M" }, color = Color.White, fontWeight = FontWeight.Black, fontSize = 40.sp)
                    }
                }

                Text(name, color = Color.White, fontWeight = FontWeight.Black, fontSize = if (name.length > 22) 17.sp else 21.sp, maxLines = 2)
                Text("★".repeat(art.stars) + "☆".repeat(5 - art.stars), color = Color.White.copy(alpha = 0.9f), fontSize = 14.sp, letterSpacing = 3.sp)

                // Identity rows.
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (store.profile.ninetyNineId.isNotBlank()) CardRow("99 ID", store.profile.ninetyNineId)
                    if (store.profile.ponto.isNotBlank()) CardRow(loc.t("member.ponto"), store.profile.ponto)
                    if (store.profile.birthday.isNotBlank()) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Cake, contentDescription = null, tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(14.dp))
                            Spacer(Modifier.size(6.dp))
                            Text(loc.t("card.birthday"), color = Color.White.copy(alpha = 0.75f), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.weight(1f))
                            Text(store.profile.birthday, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Black)
                        }
                    }
                }

                // Member QR — partners scan it to apply the rider discount.
                Box(Modifier.clip(RoundedCornerShape(14.dp)).background(Color.White).padding(10.dp)) {
                    QRCodeView(value = store.myQRPayload, size = 150)
                }
                Text(loc.t("card.showPartner"), color = Color.White.copy(alpha = 0.8f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            }

            // ---- Photo actions ----
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PhotoAction(Modifier.weight(1f), Icons.Filled.PhotoCamera, loc.t("card.takePhoto")) { takePhoto.launch(cameraUri) }
                PhotoAction(Modifier.weight(1f), Icons.Filled.PhotoLibrary, loc.t("card.gallery")) {
                    pickImage.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }
            }
            if (avatarBitmap != null) {
                PhotoAction(
                    Modifier.fillMaxWidth(),
                    if (isCartoon) Icons.Filled.Undo else Icons.Filled.AutoFixHigh,
                    if (cartoonBusy) loc.t("card.cartoonBusy") else loc.t(if (isCartoon) "card.cartoonOff" else "card.cartoonOn"),
                ) { toggleCartoon() }
            }
            PhotoAction(
                Modifier.fillMaxWidth(),
                Icons.Filled.Share,
                if (shareBusy) loc.t("card.cartoonBusy") else shareTitle,
            ) { shareCard() }
            Text(loc.t("card.photoHint"), color = me.muted, fontSize = 12.sp)
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun CardRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Color.White.copy(alpha = 0.75f), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        Text(value, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun PhotoAction(modifier: Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    val me = LocalMe.current
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeRadius.small))
            .background(me.surface)
            .border(1.dp, me.line, RoundedCornerShape(MeRadius.small))
            .clickable { onClick() }
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = me.accent, modifier = Modifier.size(18.dp))
        Spacer(Modifier.size(8.dp))
        Text(label, color = me.text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    }
}
