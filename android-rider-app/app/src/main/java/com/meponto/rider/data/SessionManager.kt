package com.meponto.rider.data

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf

/** Tracks the logged-in member (PontoSys member-login by phone). */
class SessionManager(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences("meponto_rider", Context.MODE_PRIVATE)

    var memberName by mutableStateOf(prefs.getString("member_name", null))
        private set

    val isLoggedIn: Boolean get() = memberName != null

    fun setLoggedIn(name: String) {
        memberName = name
        prefs.edit().putString("member_name", name).apply()
    }

    fun logout() {
        memberName = null
        prefs.edit().remove("member_name").apply()
    }
}

val LocalSession = staticCompositionLocalOf<SessionManager> { error("SessionManager not provided") }
