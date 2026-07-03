package com.meponto.rider.push

import androidx.compose.runtime.mutableStateOf

/**
 * Bridges notification taps to in-app navigation. The backend sends a web-style
 * `url` (e.g. "/rider-app/wallet") in the push data payload; tapping the
 * notification delivers it here and RootScaffold switches to the matching tab.
 *
 * Works for both delivery paths:
 *  - Foreground: MePontoMessagingService builds the notification itself with a
 *    PendingIntent carrying the "url" extra.
 *  - Background: the system-tray notification relaunches MainActivity with the
 *    FCM data payload as intent extras (standard FCM behaviour).
 */
object PushNavigator {
    /** URL waiting to be consumed by RootScaffold (null = nothing pending). */
    val pendingUrl = mutableStateOf<String?>(null)

    fun offer(url: String?) {
        if (!url.isNullOrBlank()) pendingUrl.value = url
    }

    fun clear() {
        pendingUrl.value = null
    }

    /** Map a backend URL to a bottom-bar tab index (home=0 fallback). */
    fun tabFor(url: String): Int {
        val u = url.lowercase()
        return when {
            "wallet" in u || "saque" in u -> 1
            "agenda" in u || "shift" in u || "turno" in u -> 2
            "mall" in u || "store" in u || "loja" in u -> 3
            "map" in u || "mapa" in u -> 4
            else -> 0
        }
    }
}
