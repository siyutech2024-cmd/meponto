package com.meponto.rider.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.theme.LocalMe

/** QR generation via ZXing. Used for the rider's personal MePonto QR and invite QR. */
object QrGen {
    fun bitmap(content: String, sizePx: Int = 512): ImageBitmap {
        val hints = mapOf(EncodeHintType.MARGIN to 1)
        val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
        val w = matrix.width
        val h = matrix.height
        val pixels = IntArray(w * h)
        val black = 0xFF000000.toInt()
        val white = 0xFFFFFFFF.toInt()
        for (y in 0 until h) {
            val offset = y * w
            for (x in 0 until w) {
                pixels[offset + x] = if (matrix.get(x, y)) black else white
            }
        }
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        bmp.setPixels(pixels, 0, w, 0, 0, w, h)
        return bmp.asImageBitmap()
    }
}

@Composable
fun QRCodeView(value: String, size: Int = 180) {
    val image = remember(value) { QrGen.bitmap(value) }
    Image(
        bitmap = image,
        contentDescription = "QR",
        filterQuality = FilterQuality.None,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White)
            .padding(12.dp)
            .size(size.dp),
    )
}

/** A reusable bottom sheet showing a titled QR with a caption. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QRSheet(title: String, caption: String, value: String, onDismiss: () -> Unit) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = me.background) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(title, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            QRCodeView(value = value, size = 200)
            Text(caption, color = me.muted, fontSize = 14.sp, textAlign = TextAlign.Center)
            Text(value, color = me.textSoft, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            PrimaryButton(title = loc.t("common.close")) { onDismiss() }
        }
    }
}
