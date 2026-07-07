package com.meponto.rider.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import com.meponto.rider.data.remote.SignupPayload

/**
 * Deferred login (mirrors iOS AuthManager): the app opens for everyone as a
 * GUEST. Member-only actions call [requireMember], which presents the auth sheet
 * when the user isn't signed in. PontoSys member-login is phone-only.
 */
enum class AuthState { GUEST, MEMBER }

class AuthController(
    private val session: SessionManager,
    private val repo: RiderRepository,
) {
    var state by mutableStateOf(if (session.isLoggedIn) AuthState.MEMBER else AuthState.GUEST)
        private set
    var presentingAuth by mutableStateOf(false)
        private set
    var working by mutableStateOf(false)
        private set
    var errorKey by mutableStateOf<String?>(null)
        private set

    // OTP flow state.
    var otpSent by mutableStateOf(false)
        private set
    var needsCpf by mutableStateOf(false)
        private set
    var rebind by mutableStateOf(false)
        private set
    var needsGoogleLink by mutableStateOf(false)
        private set
    private var googleCred: String? = null

    val isMember: Boolean get() = state == AuthState.MEMBER

    /** Returns true if already a member; otherwise opens the auth sheet and returns false. */
    fun requireMember(): Boolean {
        if (isMember) return true
        resetOtp()
        presentingAuth = true
        return false
    }

    fun presentAuth() { resetOtp(); presentingAuth = true }
    fun dismissAuth() { presentingAuth = false; resetOtp() }

    /** Surface a visible error when Google sign-in can't even produce a token. */
    fun reportGoogleUnavailable() { errorKey = "auth.googleUnavailable" }

    /** Back to the phone-entry step (also used by "change number"). */
    fun resetOtp() { otpSent = false; needsCpf = false; rebind = false; needsGoogleLink = false; googleCred = null; errorKey = null }

    /** Backend session lacks a verified phone → Profile offers verification. */
    val phoneUnverified: Boolean get() = session.phoneUnverified

    /**
     * Sign in with Google — DIRECT. Linked accounts go straight in; first-time
     * Google users also enter immediately as an unverified session (browse the
     * mall, see shifts) and verify their phone later in Profile to unlock
     * wallet/points. No phone wall at the door.
     */
    suspend fun googleLogin(credential: String) {
        working = true
        errorKey = null
        val r = repo.googleLogin(credential)
        when {
            r.ok && r.name != null -> {
                session.setLoggedIn(r.name, unverifiedPhone = r.needsVerification, riderId = r.id)
                state = AuthState.MEMBER
                presentingAuth = false
                resetOtp()
            }
            r.needsLink -> { googleCred = credential; needsGoogleLink = true; otpSent = false; needsCpf = false }
            else -> errorKey = "auth.invalid"
        }
        working = false
    }

    /**
     * OTP step 1 — request a code; pass [cpf] when rebinding a new number, or
     * [signupName] to create a brand-new account (member is built on verify,
     * mirroring the web /register phone-first signup).
     */
    suspend fun requestOtp(phone: String, cpf: String?, signupName: String? = null, signupBirthday: String? = null) {
        working = true
        errorKey = null
        val signup = signupName?.trim()?.takeIf { it.isNotEmpty() }?.let {
            SignupPayload(name = it, birthday = signupBirthday?.trim()?.takeIf { b -> Regex("""\d{4}-\d{2}-\d{2}""").matches(b) })
        }
        val r = repo.requestOtp(phone, cpf?.ifBlank { null }, signup)
        when {
            // Google guest entering a NEW phone: backend activates the member
            // directly (no SMS round-trip) — finish the login here.
            r.activatedName != null -> {
                session.setLoggedIn(r.activatedName, riderId = r.activatedId)
                state = AuthState.MEMBER
                presentingAuth = false
                resetOtp()
            }
            r.ok -> { otpSent = true; needsCpf = false; rebind = r.rebind }
            r.needsCpf -> { needsCpf = true }
            else -> { errorKey = "auth.invalid" }
        }
        working = false
    }

    /** OTP step 2 — verify the code; on success becomes a member. */
    suspend fun verifyOtp(phone: String, code: String) {
        working = true
        errorKey = null
        repo.verifyOtp(phone, code, googleCred)
            .onSuccess { (name, id) ->
                session.setLoggedIn(name, riderId = id)
                state = AuthState.MEMBER
                presentingAuth = false
                resetOtp()
            }
            .onFailure { errorKey = "auth.invalid" }
        working = false
    }

    /**
     * Create a new account: phone-first signup via OTP (the member record is
     * only created after the code is verified — same as the web /register).
     * The legacy no-code phone login is gone: it 403s when MEMBER_LOGIN_OTP=1
     * and could never create an account.
     */
    suspend fun register(name: String, phone: String) {
        if (name.isBlank() || phone.isBlank()) {
            errorKey = "auth.fillAll"
            return
        }
        requestOtp(phone, cpf = null, signupName = name)
    }

    fun logout() {
        repo.logout()
        session.logout()
        state = AuthState.GUEST
    }
}

val LocalAuth = staticCompositionLocalOf<AuthController> { error("AuthController not provided") }
