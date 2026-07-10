package com.meponto.rider.ui.screens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
import androidx.compose.material.icons.filled.Cake
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalStore
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.OverlayTopBar
import com.meponto.rider.ui.components.QRCodeView
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.appBackground
import java.io.File

private const val AVATAR_FILE = "member_avatar.jpg"

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

    // Avatar persistence: filesDir/member_avatar.jpg; version bumps recompose.
    var avatarVersion by remember { mutableIntStateOf(0) }
    val avatarBitmap: Bitmap? = remember(avatarVersion) {
        val f = File(context.filesDir, AVATAR_FILE)
        if (f.exists()) runCatching { BitmapFactory.decodeFile(f.absolutePath) }.getOrNull() else null
    }
    fun saveAvatar(bmp: Bitmap) {
        runCatching {
            val scale = minOf(1f, 640f / maxOf(bmp.width, bmp.height))
            val out = if (scale < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true) else bmp
            File(context.filesDir, AVATAR_FILE).outputStream().use { out.compress(Bitmap.CompressFormat.JPEG, 88, it) }
            avatarVersion += 1
        }
    }
    val takePhoto = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
        if (bmp != null) saveAvatar(bmp)
    }
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
            }.getOrNull()?.let { saveAvatar(it) }
        }
    }

    val tierKey = store.serverTier?.tier ?: "member"
    val art = artFor(tierKey)
    val tierLabel = store.serverTier?.label ?: "Membro"
    val name = store.profile.name.ifBlank { store.riderName }

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
                PhotoAction(Modifier.weight(1f), Icons.Filled.PhotoCamera, loc.t("card.takePhoto")) { takePhoto.launch(null) }
                PhotoAction(Modifier.weight(1f), Icons.Filled.PhotoLibrary, loc.t("card.gallery")) {
                    pickImage.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }
            }
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
