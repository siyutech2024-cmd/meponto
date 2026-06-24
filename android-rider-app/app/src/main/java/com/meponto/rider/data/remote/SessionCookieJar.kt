package com.meponto.rider.data.remote

import android.content.Context
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Minimal persistent cookie jar so the PontoSys session cookie (meponto_session)
 * survives across requests and app launches. Cookies are stored per host in
 * SharedPreferences as raw Set-Cookie strings and re-parsed on load.
 */
class SessionCookieJar(context: Context) : CookieJar {
    private val prefs = context.applicationContext.getSharedPreferences("meponto_cookies", Context.MODE_PRIVATE)
    private val store = HashMap<String, MutableList<Cookie>>()

    init {
        prefs.getStringSet("cookies", emptySet())?.forEach { line ->
            val sep = line.indexOf("|||")
            if (sep > 0) {
                val host = line.substring(0, sep)
                val raw = line.substring(sep + 3)
                val url = "https://$host/".toHttpUrlOrNull()
                if (url != null) {
                    Cookie.parse(url, raw)?.let { store.getOrPut(host) { mutableListOf() }.add(it) }
                }
            }
        }
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        val list = store.getOrPut(url.host) { mutableListOf() }
        for (c in cookies) {
            list.removeAll { it.name == c.name }
            list.add(c)
        }
        persist()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        val list = store[url.host] ?: return emptyList()
        list.removeAll { it.expiresAt < now }
        return list
    }

    private fun persist() {
        val lines = HashSet<String>()
        for ((host, list) in store) {
            for (c in list) lines.add("$host|||${c}")
        }
        prefs.edit().putStringSet("cookies", lines).apply()
    }

    fun clear() {
        store.clear()
        prefs.edit().remove("cookies").apply()
    }
}
