package com.meponto.rider.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.data.LocalStore
import com.meponto.rider.ui.components.OverlayTopBar
import com.meponto.rider.ui.components.PrimaryButton
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.appBackground

@Composable
fun ScanScreen(onClose: () -> Unit) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val context = LocalContext.current

    var scanned by remember { mutableStateOf<String?>(null) }
    var awarded by remember { mutableStateOf<Int?>(null) }
    var failed by remember { mutableStateOf(false) }
    // Scanning a station QR = check-in. The BACKEND decides: real Ponto code,
    // once per day, award size. null = rejected → failure state (no fake +50).
    LaunchedEffect(scanned) {
        val code = scanned ?: return@LaunchedEffect
        val result = store.checkIn(code)
        if (result != null) awarded = result else failed = true
    }
    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> hasPermission = granted }

    LaunchedEffect(Unit) {
        if (!hasPermission) launcher.launch(Manifest.permission.CAMERA)
    }

    Column(Modifier.fillMaxSize().appBackground(me)) {
        OverlayTopBar(title = loc.t("scan.title"), onClose = onClose)
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            when {
                failed -> FailedView(
                    code = scanned ?: "",
                    onRetry = { scanned = null; awarded = null; failed = false },
                    onDone = onClose,
                )
                awarded != null -> ResultView(scanned ?: "", awarded, onDone = onClose)
                scanned != null -> PendingView()
                hasPermission -> CameraPreview(onScan = { if (scanned == null) scanned = it })
                else -> NoCameraView()
            }
            if (scanned == null && hasPermission && !failed) ScannerOverlay()
        }
    }
}

@androidx.annotation.OptIn(ExperimentalGetImage::class)
@Composable
private fun CameraPreview(onScan: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            val previewView = PreviewView(ctx)
            val providerFuture = ProcessCameraProvider.getInstance(ctx)
            providerFuture.addListener({
                val cameraProvider = providerFuture.get()
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }
                val scanner = BarcodeScanning.getClient()
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analysis.setAnalyzer(ContextCompat.getMainExecutor(ctx)) { imageProxy ->
                    val mediaImage = imageProxy.image
                    if (mediaImage != null) {
                        val input = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                        scanner.process(input)
                            .addOnSuccessListener { codes ->
                                codes.firstOrNull()?.rawValue?.let { onScan(it) }
                            }
                            .addOnCompleteListener { imageProxy.close() }
                    } else {
                        imageProxy.close()
                    }
                }
                try {
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        analysis,
                    )
                } catch (_: Exception) {
                }
            }, ContextCompat.getMainExecutor(ctx))
            previewView
        },
    )
}

@Composable
private fun ScannerOverlay() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier
                .size(220.dp)
                .border(3.dp, me.accent, RoundedCornerShape(16.dp))
        )
        Spacer(Modifier.size(16.dp))
        Text(loc.t("scan.hint"), color = Color.White, fontSize = 14.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun PendingView() {
    val me = LocalMe.current
    CircularProgressIndicator(color = me.accent)
}

@Composable
private fun NoCameraView() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Filled.QrCodeScanner, contentDescription = null, tint = me.accent, modifier = Modifier.size(72.dp))
        Spacer(Modifier.size(18.dp))
        Text(loc.t("scan.noCamera"), color = me.muted, fontSize = 14.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun FailedView(code: String, onRetry: () -> Unit, onDone: () -> Unit) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Filled.ErrorOutline, contentDescription = null, tint = me.danger, modifier = Modifier.size(64.dp))
        Spacer(Modifier.size(18.dp))
        Text(loc.t("scan.failed"), color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.size(8.dp))
        Text(
            code,
            color = me.muted,
            fontSize = 12.sp,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(me.surfaceRaised)
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )
        Spacer(Modifier.size(18.dp))
        PrimaryButton(
            title = loc.t("common.retry"),
            icon = Icons.Filled.QrCodeScanner,
            modifier = Modifier.widthIn(max = 260.dp),
        ) { onRetry() }
        Spacer(Modifier.size(10.dp))
        PrimaryButton(
            title = loc.t("common.done"),
            icon = Icons.Filled.Check,
            modifier = Modifier.widthIn(max = 260.dp),
        ) { onDone() }
    }
}

@Composable
private fun ResultView(code: String, awarded: Int?, onDone: () -> Unit) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Filled.Verified, contentDescription = null, tint = me.ok, modifier = Modifier.size(64.dp))
        Spacer(Modifier.size(18.dp))
        Text(loc.t("scan.checkedIn"), color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        if (awarded != null) {
            Spacer(Modifier.size(6.dp))
            Text("${loc.t("scan.pointsEarned")}: +$awarded", color = me.ok, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
        Spacer(Modifier.size(8.dp))
        Text(
            code,
            color = me.textSoft,
            fontSize = 14.sp,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(me.surfaceRaised)
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )
        Spacer(Modifier.size(18.dp))
        PrimaryButton(
            title = loc.t("common.done"),
            icon = Icons.Filled.Check,
            modifier = Modifier.widthIn(max = 260.dp),
        ) { onDone() }
    }
}
