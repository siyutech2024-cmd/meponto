package com.meponto.rider.push

import androidx.compose.runtime.mutableStateOf

/** Full content of a tapped notification — shown as an in-app detail card. */
data class PushNotice(
    val title: String,
    val body: String,
    val imageUrl: String? = null,
    val url: String = "/rider-app",
)

/**
 * Bridges notification taps to in-app navigation. The backend sends a web-style
 * `url` (e.g. "/rider-app/wallet") in the push data payload; tapping the
 * notification delivers it here and RootScaffold switches to the matching tab
 * AND shows a detail card with the full title/body/image (the tray truncates
 * long text — the card is where the rider reads the whole message).
 *
 * Works for both delivery paths:
 *  - Foreground: MePontoMessagingService builds the notification itself with a
 *    PendingIntent carrying the extras.
 *  - Background: the system-tray notification relaunches MainActivity with the
 *    FCM data payload as intent extras (standard FCM behaviour).
 */
object PushNavigator {
    /** URL waiting to be consumed by RootScaffold (null = nothing pending). */
    val pendingUrl = mutableStateOf<String?>(null)

    /** Full notification content for the in-app detail card. */
    val pendingNotice = mutableStateOf<PushNotice?>(null)

    fun offer(url: String?, title: String? = null, body: String? = null, imageUrl: String? = null) {
        if (!url.isNullOrBlank()) pendingUrl.value = url
        if (!title.isNullOrBlank() && !body.isNullOrBlank()) {
            pendingNotice.value = PushNotice(title, body, imageUrl?.takeIf { it.isNotBlank() }, url ?: "/rider-app")
        }
    }

    fun clear() {
        pendingUrl.value = null
    }

    fun clearNotice() {
        pendingNotice.value = null
    }

    /** Map a backend URL to a bottom-bar tab index (home=0 fallback). */
    fun tabFor(url: String): Int {
        val u = url.lowercase()
        return when {
            "agenda" in u || "shift" in u || "turno" in u -> 1
            "mall" in u || "store" in u || "loja" in u || "mensagem" in u -> 2
            "map" in u || "mapa" in u -> 3
            // wallet removed from the bar — those links land on Home.
            else -> 0
        }
    }
}
