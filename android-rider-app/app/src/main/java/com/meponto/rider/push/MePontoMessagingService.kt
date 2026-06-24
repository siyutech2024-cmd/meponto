package com.meponto.rider.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.meponto.rider.R
import com.meponto.rider.data.RiderRepository
import com.meponto.rider.data.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Receives FCM pushes and shows a notification. Channel id matches the manifest meta-data. */
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
        showNotification(title, body)
    }

    private fun showNotification(title: String, body: String) {
        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "MePonto", NotificationManager.IMPORTANCE_HIGH)
            mgr.createNotificationChannel(channel)
        }
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        // Guard: throws if POST_NOTIFICATIONS isn't granted (Android 13+).
        runCatching {
            NotificationManagerCompat.from(this).notify(System.currentTimeMillis().toInt(), notification)
        }
    }

    companion object {
        const val CHANNEL_ID = "meponto_default"
        const val TAG = "MePontoFCM"
    }
}
