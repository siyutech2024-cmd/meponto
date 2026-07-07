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

    /** PontoSys rider id captured at login — powers referral/partner QR links. */
    var memberId by mutableStateOf(prefs.getString("member_id", null))
        private set

    /**
     * True for Google-only sign-ins that haven't confirmed a phone yet: the
     * user browses normally, but wallet/points/shifts stay locked server-side
     * until they verify in Profile (the backend session is `verified:false`).
     */
    var phoneUnverified by mutableStateOf(prefs.getBoolean("phone_unverified", false))
        private set

    val isLoggedIn: Boolean get() = memberName != null

    fun setLoggedIn(name: String, unverifiedPhone: Boolean = false, riderId: String? = null) {
        memberName = name
        phoneUnverified = unverifiedPhone
        if (riderId != null) memberId = riderId
        prefs.edit()
            .putString("member_name", name)
            .putBoolean("phone_unverified", unverifiedPhone)
            .apply()
        if (riderId != null) prefs.edit().putString("member_id", riderId).apply()
    }

    fun markPhoneVerified() {
        phoneUnverified = false
        prefs.edit().putBoolean("phone_unverified", false).apply()
    }

    fun logout() {
        memberName = null
        memberId = null
        phoneUnverified = false
        prefs.edit().remove("member_name").remove("member_id").remove("phone_unverified").apply()
    }
}

val LocalSession = staticCompositionLocalOf<SessionManager> { error("SessionManager not provided") }
