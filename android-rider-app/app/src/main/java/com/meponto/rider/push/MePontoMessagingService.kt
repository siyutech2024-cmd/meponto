package com.meponto.rider.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.meponto.rider.MainActivity
import com.meponto.rider.R
import com.meponto.rider.data.RiderRepository
import com.meponto.rider.data.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URL

/**
 * Receives FCM pushes and shows a rich notification. Channel id matches the
 * manifest meta-data. Rich pieces (all optional, sent by the backend in the
 * data payload): "url" = in-app destination opened on tap, "image" = big
 * picture. Long bodies expand with BigTextStyle; the brand yellow tints the
 * small icon.
 */
class MePontoMessagingService : FirebaseMessagingService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        // Grab this from Logcat (tag MePontoFCM) to send a test push from Firebase Console.
        Log.d(TAG, "FCM token: $token")
        val name = SessionManager(applicationContext).memberName ?: return
        scope.launch { RiderRepository(applicationContext).registerPushToken(name, token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: "MePonto"
        val body = message.notification?.body ?: message.data["body"] ?: ""
        val url = message.data["url"] ?: "/rider-app"
        val imageUrl = message.notification?.imageUrl?.toString() ?: message.data["image"]
        showNotification(title, body, url, imageUrl)
    }

    private fun showNotification(title: String, body: String, url: String, imageUrl: String?) {
        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "MePonto", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Avisos MePonto: turnos, pagamentos, PontoMall"
                enableLights(true)
                lightColor = BRAND_YELLOW
                enableVibration(true)
            }
            mgr.createNotificationChannel(channel)
        }

        // Tap → reopen MainActivity carrying the destination URL (singleTop, so
        // a running app receives it via onNewIntent instead of restarting).
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("url", url)
        }
        val pending = PendingIntent.getActivity(
            this,
            url.hashCode(),
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Big picture is best-effort: a slow/broken image must never block or
        // drop the notification (onMessageReceived already runs off-main).
        val picture: Bitmap? = imageUrl?.let { fetchBitmap(it) }

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setColor(BRAND_YELLOW)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)

        if (picture != null) {
            builder.setLargeIcon(picture)
                .setStyle(
                    NotificationCompat.BigPictureStyle()
                        .bigPicture(picture)
                        .bigLargeIcon(null as Bitmap?)
                        .setSummaryText(body),
                )
        } else {
            // Long Portuguese copy stays fully readable when expanded.
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }

        // Guard: throws if POST_NOTIFICATIONS isn't granted (Android 13+).
        runCatching {
            NotificationManagerCompat.from(this).notify(System.currentTimeMillis().toInt(), builder.build())
        }
    }

    /** Download the big-picture image with tight timeouts. Null on any failure. */
    private fun fetchBitmap(url: String): Bitmap? = runCatching {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 5000
        conn.readTimeout = 5000
        conn.inputStream.use { BitmapFactory.decodeStream(it) }
    }.getOrNull()

    companion object {
        const val CHANNEL_ID = "meponto_default"
        const val TAG = "MePontoFCM"
        private const val BRAND_YELLOW = 0xFFFFD100.toInt()
    }
}
