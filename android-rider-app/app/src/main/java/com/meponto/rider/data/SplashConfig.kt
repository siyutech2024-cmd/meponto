package com.meponto.rider.data

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Launch / splash (开屏广告页) configuration.
 *
 * In production these values are pushed by the MePonto main backend (PontoSys
 * console): the app fetches JSON from [SplashController.ENDPOINT] on launch,
 * caches it, and uses it next time. A bundled default is used until the first
 * successful fetch. Profile exposes a local preview editor for testing without
 * the backend running.
 */
data class SplashConfig(
    val enabled: Boolean,
    val headline: String,
    val tagline: String,       // empty → use the localized default
    val durationMs: Int,
    val backgroundHex: String, // "#07090d"
    val accentHex: String,     // "#ffd100"
    val imageUrl: String,      // optional remote ad/banner image
    val linkUrl: String,       // optional tap-through for the ad
) {
    val backgroundColor: Color get() = parseHexColor(backgroundHex) ?: Color(0xFF07090D)
    val accentColor: Color get() = parseHexColor(accentHex) ?: Color(0xFFFFD100)
    val durationSeconds: Double get() = maxOf(600, durationMs) / 1000.0

    companion object {
        val DEFAULT = SplashConfig(
            enabled = true,
            headline = "MePonto",
            tagline = "",
            durationMs = 2200,
            backgroundHex = "#07090d",
            accentHex = "#ffd100",
            imageUrl = "",
            linkUrl = "",
        )

        fun parseHexColor(hex: String): Color? {
            var s = hex.trim()
            if (s.startsWith("#")) s = s.substring(1)
            if (s.length != 6) return null
            return try {
                val v = s.toLong(16)
                Color(0xFF000000L or v)
            } catch (_: NumberFormatException) {
                null
            }
        }

        fun fromJson(o: JSONObject): SplashConfig = SplashConfig(
            enabled = o.optBoolean("enabled", DEFAULT.enabled),
            headline = o.optString("headline", DEFAULT.headline),
            tagline = o.optString("tagline", DEFAULT.tagline),
            durationMs = o.optInt("durationMs", DEFAULT.durationMs),
            backgroundHex = o.optString("backgroundHex", DEFAULT.backgroundHex),
            accentHex = o.optString("accentHex", DEFAULT.accentHex),
            imageUrl = o.optString("imageURL", DEFAULT.imageUrl),
            linkUrl = o.optString("linkURL", DEFAULT.linkUrl),
        )
    }
}

/** Holds the splash config in Compose state, cached in SharedPreferences. */
class SplashController(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences("meponto_rider", Context.MODE_PRIVATE)

    var config by mutableStateOf(load())
        private set

    private fun load(): SplashConfig {
        if (!prefs.contains("splash_enabled")) return SplashConfig.DEFAULT
        val d = SplashConfig.DEFAULT
        return SplashConfig(
            enabled = prefs.getBoolean("splash_enabled", d.enabled),
            headline = prefs.getString("splash_headline", d.headline) ?: d.headline,
            tagline = prefs.getString("splash_tagline", d.tagline) ?: d.tagline,
            durationMs = prefs.getInt("splash_durationMs", d.durationMs),
            backgroundHex = prefs.getString("splash_bg", d.backgroundHex) ?: d.backgroundHex,
            accentHex = prefs.getString("splash_accent", d.accentHex) ?: d.accentHex,
            imageUrl = prefs.getString("splash_image", d.imageUrl) ?: d.imageUrl,
            linkUrl = prefs.getString("splash_link", d.linkUrl) ?: d.linkUrl,
        )
    }

    fun update(c: SplashConfig) {
        config = c
        prefs.edit()
            .putBoolean("splash_enabled", c.enabled)
            .putString("splash_headline", c.headline)
            .putString("splash_tagline", c.tagline)
            .putInt("splash_durationMs", c.durationMs)
            .putString("splash_bg", c.backgroundHex)
            .putString("splash_accent", c.accentHex)
            .putString("splash_image", c.imageUrl)
            .putString("splash_link", c.linkUrl)
            .apply()
    }

    fun resetToDefault() = update(SplashConfig.DEFAULT)

    /** Best-effort pull of backend-managed config; failures keep cache/default. */
    suspend fun refresh() {
        try {
            withContext(Dispatchers.IO) {
                val conn = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 4000
                    readTimeout = 4000
                    requestMethod = "GET"
                }
                try {
                    if (conn.responseCode == 200) {
                        val body = conn.inputStream.bufferedReader().use { it.readText() }
                        val parsed = SplashConfig.fromJson(JSONObject(body))
                        withContext(Dispatchers.Main) { update(parsed) }
                    }
                } finally {
                    conn.disconnect()
                }
            }
        } catch (_: Exception) {
            // Offline / not configured yet → keep cached or default.
        }
    }

    companion object {
        const val ENDPOINT = "https://mall.meponto.com/api/app/rider/splash"
    }
}

val LocalSplash = staticCompositionLocalOf<SplashController> {
    error("SplashController not provided")
}
