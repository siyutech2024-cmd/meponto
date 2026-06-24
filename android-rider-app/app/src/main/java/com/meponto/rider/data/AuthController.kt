package com.meponto.rider.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf

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

    /** Back to the phone-entry step (also used by "change number"). */
    fun resetOtp() { otpSent = false; needsCpf = false; rebind = false; needsGoogleLink = false; googleCred = null; errorKey = null }

    /** Sign in with Google. Linked → member; first time → bind via phone+CPF. */
    suspend fun googleLogin(credential: String) {
        working = true
        errorKey = null
        val r = repo.googleLogin(credential)
        when {
            r.ok && r.name != null -> {
                session.setLoggedIn(r.name)
                state = AuthState.MEMBER
                presentingAuth = false
                resetOtp()
            }
            r.needsLink -> { googleCred = credential; needsGoogleLink = true; otpSent = false; needsCpf = false }
            else -> errorKey = "auth.invalid"
        }
        working = false
    }

    /** OTP step 1 — request a code; pass [cpf] when rebinding a new number. */
    suspend fun requestOtp(phone: String, cpf: String?) {
        working = true
        errorKey = null
        val r = repo.requestOtp(phone, cpf?.ifBlank { null })
        when {
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
            .onSuccess { name ->
                session.setLoggedIn(name)
                state = AuthState.MEMBER
                presentingAuth = false
                resetOtp()
            }
            .onFailure { errorKey = "auth.invalid" }
        working = false
    }

    suspend fun login(phone: String) {
        working = true
        errorKey = null
        repo.login(phone)
            .onSuccess { name ->
                session.setLoggedIn(name)
                state = AuthState.MEMBER
                presentingAuth = false
            }
            .onFailure { errorKey = "auth.invalid" }
        working = false
    }

    /** member-login is phone-only; register reuses the same flow after a basic check. */
    suspend fun register(name: String, phone: String) {
        if (name.isBlank() || phone.isBlank()) {
            errorKey = "auth.fillAll"
            return
        }
        login(phone)
    }

    fun logout() {
        repo.logout()
        session.logout()
        state = AuthState.GUEST
    }
}

val LocalAuth = staticCompositionLocalOf<AuthController> { error("AuthController not provided") }
