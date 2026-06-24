package com.meponto.rider.data

import android.content.Context
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.runtime.staticCompositionLocalOf
import com.meponto.rider.data.remote.ApiClient
import com.meponto.rider.data.remote.CatalogProductDto
import com.meponto.rider.data.remote.CheckinRequest
import com.meponto.rider.data.remote.GoogleLoginRequest
import com.meponto.rider.data.remote.InboxDto
import com.meponto.rider.data.remote.LedgerDto
import com.meponto.rider.data.remote.MemberLoginRequest
import com.meponto.rider.data.remote.MissionDto
import com.meponto.rider.data.remote.PartnerBenefitDto
import com.meponto.rider.data.remote.PartnerDto
import com.meponto.rider.data.remote.PayoutRequest
import com.meponto.rider.data.remote.PerformanceDto
import com.meponto.rider.data.remote.PointsLedgerDto
import com.meponto.rider.data.remote.ProfileUpdateRequest
import com.meponto.rider.data.remote.PushTokenRequest
import com.meponto.rider.data.remote.RedeemRequest
import com.meponto.rider.data.remote.RiderProfileDto
import com.meponto.rider.data.remote.RiderSlotDto
import com.meponto.rider.data.remote.SlotCancelRequest
import com.meponto.rider.data.remote.SlotEnrollRequest
import com.meponto.rider.data.remote.SlotEnrollmentDto
import com.meponto.rider.ui.theme.Tone
import java.text.SimpleDateFormat
import java.util.Locale
import kotlin.math.abs

/** A partial snapshot from the PontoSys API; null fields keep mock values. */
data class RiderSnapshot(
    val riderName: String? = null,
    val ponto: String? = null,
    val leader: String? = null,
    val ninetyNineId: String? = null,
    val cpf: String? = null,
    val phone: String? = null,
    val pix: String? = null,
    val walletAvailable: Double? = null,
    val walletPending: Double? = null,
    val weeklyGoalProgress: Int? = null,
    val pointsBalance: Int? = null,
    val pointsLedger: List<PointsLedgerEntry>? = null,
    val products: List<MallProduct>? = null,
    val shifts: List<Shift>? = null,
    // Tier metrics + Home dashboard aggregate (GET /rider/home).
    val ar: Int? = null,
    val nightShiftCount: Int? = null,
    val incidentCount: Int? = null,
    val performance: Performance? = null,
    val cashLedger: List<LedgerEntry>? = null,
    val partners: List<Partner>? = null,
    val partnerBenefits: List<PartnerBenefit>? = null,
    val missions: List<Mission>? = null,
    val inbox: List<InboxItem>? = null,
)

/** Result of an OTP request: ok=code sent; needsCpf=phone unknown, ask CPF to rebind. */
data class OtpResult(
    val ok: Boolean,
    val rebind: Boolean = false,
    val needsCpf: Boolean = false,
    val error: String? = null,
)

/** Google login: ok=signed in; needsLink=first time, bind via phone+CPF. */
data class GoogleResult(
    val ok: Boolean,
    val name: String? = null,
    val needsLink: Boolean = false,
    val email: String? = null,
    val error: String? = null,
)

/**
 * Talks to the PontoSys API and maps responses into the app's domain models.
 * Every network call is wrapped so a failure (offline, shape change, 4xx) never
 * crashes the UI — the store simply keeps its mock data.
 */
class RiderRepository(context: Context) {
    private val api = ApiClient(context)
    private val service = api.service

    /** member-login by phone → returns the member's display name on success. */
    suspend fun login(phone: String): Result<String> = try {
        val resp = service.memberLogin(MemberLoginRequest(phone))
        val name = resp.data?.name
        if (name != null) Result.success(name)
        else Result.failure(IllegalStateException(resp.error ?: "Login falhou"))
    } catch (e: Exception) {
        Result.failure(e)
    }

    /** OTP step 1 — request a code for [phone]; pass [cpf] to (re)bind a new number. */
    suspend fun requestOtp(phone: String, cpf: String?): OtpResult = try {
        val resp = service.requestOtp(MemberLoginRequest(phone, action = "request-otp", cpf = cpf))
        val d = resp.data
        when {
            d?.sent == true -> OtpResult(ok = true, rebind = d.rebind == true)
            d?.needsCpf == true -> OtpResult(ok = false, needsCpf = true)
            else -> OtpResult(ok = false, error = resp.error ?: "Falha ao enviar código")
        }
    } catch (e: Exception) {
        OtpResult(ok = false, error = e.message)
    }

    /** OTP step 2 — verify [code]; optionally bind a Google account on success. */
    suspend fun verifyOtp(phone: String, code: String, googleCredential: String? = null): Result<String> = try {
        val resp = service.verifyOtp(MemberLoginRequest(phone, action = "verify-otp", code = code, googleCredential = googleCredential))
        val name = resp.data?.name
        if (name != null) Result.success(name)
        else Result.failure(IllegalStateException(resp.error ?: "Código inválido"))
    } catch (e: Exception) {
        Result.failure(e)
    }

    /** Sign in with Google: verified ID token → linked rider, or needsLink. */
    suspend fun googleLogin(credential: String): GoogleResult = try {
        val resp = service.googleLogin(GoogleLoginRequest(credential = credential))
        val d = resp.data
        when {
            d?.name != null -> GoogleResult(ok = true, name = d.name)
            d?.needsLink == true -> GoogleResult(ok = false, needsLink = true, email = d.email)
            else -> GoogleResult(ok = false, error = resp.error ?: "Falha no Google")
        }
    } catch (e: Exception) {
        GoogleResult(ok = false, error = e.message)
    }

    fun logout() = api.cookieJar.clear()

    /** Submit a slot application (rider must be tier-2+ and the week must be open). */
    suspend fun enrollSlot(slotApiId: String): Result<Unit> = try {
        val resp = service.enrollSlot(SlotEnrollRequest(slotId = slotApiId))
        if (resp.data != null) Result.success(Unit)
        else Result.failure(IllegalStateException(resp.error ?: "Falha ao inscrever"))
    } catch (e: Exception) {
        Result.failure(e)
    }

    /** Pulls wallet → points → catalog → slots for the logged-in rider. */
    suspend fun loadSnapshot(riderName: String): RiderSnapshot {
        val walletEnv = runCatching { service.wallet(riderName) }.getOrNull()
        val me = walletEnv?.data?.me
        val riderId = me?.riderId

        val pointsEnv = riderId?.let { id -> runCatching { service.points(id) }.getOrNull() }
        val account = pointsEnv?.data?.accounts?.firstOrNull { it.riderId == riderId }
            ?: pointsEnv?.data?.accounts?.firstOrNull()
        val ledger = pointsEnv?.data?.ledger?.mapNotNull { it.toDomain() }

        val catalogEnv = runCatching { service.catalog() }.getOrNull()
        val products = catalogEnv?.data
            ?.filter { it.status == null || it.status == "active" }
            ?.mapIndexedNotNull { idx, p -> p.toMallProduct(idx) }

        val slotsEnv = runCatching { service.slots() }.getOrNull()
        val slotDtos = slotsEnv?.data?.slots
        val enrollBySlot = (slotsEnv?.data?.enrollments ?: emptyList()).groupBy { it.slotId }
        val shifts = slotDtos?.mapNotNull { it.toShift(enrollBySlot[it.id]) }
        val slotPonto = slotDtos?.firstOrNull()?.pontoName

        // Authoritative identity (overrides wallet-derived fields where present).
        val profile = runCatching { service.riderProfile() }.getOrNull()?.data

        // Home dashboard aggregate (performance / ledger / partners / missions / inbox).
        val home = runCatching { service.riderHome() }.getOrNull()?.data

        return RiderSnapshot(
            riderName = profile?.name ?: me?.name,
            ponto = profile?.ponto ?: slotPonto,
            leader = profile?.leader,
            ninetyNineId = profile?.ninetyNineId,
            cpf = profile?.cpf ?: me?.cpf,
            phone = profile?.phone ?: me?.phone,
            pix = profile?.pix ?: me?.pix,
            walletAvailable = me?.available,
            walletPending = me?.held,
            weeklyGoalProgress = home?.weeklyGoalProgress,
            pointsBalance = account?.available,
            pointsLedger = ledger,
            products = products,
            shifts = shifts,
            ar = profile?.ar,
            nightShiftCount = profile?.nightShiftCount,
            incidentCount = profile?.incidentCount,
            performance = home?.performance?.toDomain(),
            cashLedger = home?.cashLedger?.map { it.toDomain() },
            partners = home?.partners?.mapIndexedNotNull { idx, p -> p.toDomain(idx) },
            partnerBenefits = home?.partnerBenefits?.map { it.toDomain() },
            missions = home?.missions?.map { it.toDomain() },
            inbox = home?.inbox?.map { it.toDomain() },
        )
    }

    /** GET /rider/profile (best-effort). */
    suspend fun fetchRiderProfile(): RiderProfileDto? =
        runCatching { service.riderProfile() }.getOrNull()?.data

    // ----- Write paths (best-effort; Idempotency-Key added by ApiClient) -----

    /** POST /rider/payout — amount null = full available. */
    suspend fun requestPayout(amount: Double? = null) {
        runCatching { service.payout(PayoutRequest(amount)) }
    }

    /** POST /marketplace/redeem. */
    suspend fun redeem(productApiId: String, qty: Int = 1) {
        runCatching { service.redeem(RedeemRequest(productApiId, qty)) }
    }

    /** POST /slots/cancel. */
    suspend fun cancelSlot(slotApiId: String) {
        runCatching { service.cancelSlot(SlotCancelRequest(slotApiId)) }
    }

    /** POST /rider/checkin → awarded points (null on failure). */
    suspend fun checkin(pontoCode: String): Int? =
        runCatching { service.checkin(CheckinRequest(pontoCode)) }.getOrNull()?.data?.points

    /** POST /rider/profile. */
    suspend fun updateProfile(name: String, cpf: String, phone: String, pix: String) {
        runCatching { service.updateProfile(ProfileUpdateRequest(name, cpf, phone, pix)) }
    }

    /** Register this device's FCM token with the backend (best-effort). */
    suspend fun registerPushToken(riderName: String, token: String) {
        runCatching { service.registerPush(PushTokenRequest("registerToken", token, riderName, "android")) }
    }

    suspend fun unregisterPushToken(token: String) {
        runCatching { service.registerPush(PushTokenRequest("unregisterToken", token)) }
    }

    private companion object {
        val EARN_TYPES = setOf("earn", "refund", "release", "adjust")
        val APPROVED = setOf("hq_reviewed", "franchise_confirmed")
        val INACTIVE = setOf("rejected", "cancelled")
    }

    private fun PointsLedgerDto.toDomain(): PointsLedgerEntry? {
        val mag = points ?: return null
        val signed = if ((type ?: "") in EARN_TYPES) abs(mag) else -abs(mag)
        return PointsLedgerEntry(
            note = note ?: reasonCode ?: (type ?: "—"),
            source = sourceType ?: "",
            points = signed,
            status = status ?: "",
        )
    }

    // ----- Home aggregate mappers (GET /rider/home) -----
    private fun PerformanceDto.toDomain() = Performance(
        orders = orders ?: 0,
        tshHours = tshHours ?: 0.0,
        acceptanceRate = acceptanceRate ?: 0,
        cancelledOrders = cancelledOrders ?: 0,
    )

    private fun LedgerDto.toDomain() = LedgerEntry(
        title = title ?: "",
        detail = subtitle ?: "",
        value = amount ?: "",
        status = status ?: "",
        tone = parseTone(tone),
    )

    private fun PartnerDto.toDomain(idx: Int) = Partner(
        id = id?.hashCode() ?: idx,
        name = name ?: "",
        neighborhood = neighborhood ?: "",
        category = category ?: "",
        services = services ?: "",
        discountBRL = discountBRL ?: 0,
        partnerPoints = partnerPoints ?: 0,
        distance = distance ?: "",
        latitude = latitude ?: 0.0,
        longitude = longitude ?: 0.0,
    )

    private fun PartnerBenefitDto.toDomain() = PartnerBenefit(
        partner = partner ?: "",
        service = service ?: "",
        discount = discount ?: "",
        status = status ?: "",
        tone = parseTone(tone),
    )

    private fun MissionDto.toDomain() = Mission(
        title = title ?: "",
        reward = reward ?: "",
        progress = (progress ?: 0f).coerceIn(0f, 1f),
    )

    private fun InboxDto.toDomain() = InboxItem(
        title = title ?: "",
        detail = detail ?: "",
        time = time ?: "",
    )

    private fun parseTone(s: String?): Tone = when (s?.uppercase()) {
        "OK" -> Tone.OK
        "WARNING" -> Tone.WARNING
        "DANGER" -> Tone.DANGER
        "ACCENT" -> Tone.ACCENT
        else -> Tone.NEUTRAL
    }

    private fun CatalogProductDto.toMallProduct(idx: Int): MallProduct? {
        val nm = name ?: return null
        return MallProduct(
            id = id?.hashCode() ?: idx,
            name = nm,
            category = category ?: "",
            points = pointsPrice ?: 0,
            icon = Icons.Filled.ShoppingBag,
            stock = stock ?: 0,
            apiId = id,
        )
    }

    private fun RiderSlotDto.toShift(enrolls: List<SlotEnrollmentDto>?): Shift? {
        val d = date ?: return null
        val active = enrolls?.firstOrNull { (it.status ?: "") !in INACTIVE }
        val st = when (active?.status) {
            null -> ShiftSignupStatus.NONE
            in APPROVED -> ShiftSignupStatus.APPROVED
            else -> ShiftSignupStatus.SUBMITTED
        }
        return Shift(
            id = id?.hashCode() ?: d.hashCode(),
            zone = pontoName ?: "",
            station = franchiseName ?: "",
            dateKey = d,
            weekday = weekday ?: "",
            dayLabel = dayLabelOf(d),
            window = "${startTime ?: ""} – ${endTime ?: ""}",
            hotzone = quotaNote ?: (pontoName ?: ""),
            totalSpots = capacity ?: 0,
            takenSpots = enrolled ?: 0,
            critical = priority ?: false,
            status = st,
            apiId = id,
        )
    }

    private fun dayLabelOf(dateKey: String): String = try {
        val parsed = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(dateKey)
        if (parsed != null) SimpleDateFormat("dd/MM", Locale.US).format(parsed) else dateKey
    } catch (_: Exception) {
        dateKey
    }
}

val LocalRepo = staticCompositionLocalOf<RiderRepository> { error("RiderRepository not provided") }
