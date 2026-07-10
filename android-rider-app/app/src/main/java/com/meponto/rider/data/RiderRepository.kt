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
import com.meponto.rider.data.remote.CouponDto
import com.meponto.rider.data.remote.MallMarkReadRequest
import com.meponto.rider.data.remote.MallOrderDto
import com.meponto.rider.data.remote.MallRedeemRequest
import com.meponto.rider.data.remote.MemberLoginRequest
import com.meponto.rider.data.remote.MemberMessageDto
import com.meponto.rider.data.remote.MissionDto
import com.meponto.rider.data.remote.PartnerBenefitDto
import com.meponto.rider.data.remote.PartnerDto
import com.meponto.rider.data.remote.PerformanceDto
import com.meponto.rider.data.remote.PontoDto
import com.meponto.rider.data.remote.PointsLedgerDto
import com.meponto.rider.data.remote.ProfileUpdateRequest
import com.meponto.rider.data.remote.PushTokenRequest
import com.meponto.rider.data.remote.RiderProfileDto
import com.meponto.rider.data.remote.RiderSlotDto
import com.meponto.rider.data.remote.ServerTierDto
import com.meponto.rider.data.remote.SignupPayload
import com.meponto.rider.data.remote.TaskClaimRequest
import com.meponto.rider.data.remote.TaskDto
import com.meponto.rider.data.remote.SlotCancelRequest
import com.meponto.rider.data.remote.SlotEnrollRequest
import com.meponto.rider.data.remote.SlotEnrollmentDto
import com.meponto.rider.data.remote.WithdrawRequest
import com.meponto.rider.ui.theme.Tone
import java.text.SimpleDateFormat
import java.util.Locale
import kotlin.math.abs

/** A partial snapshot from the PontoSys API; null fields keep mock values. */
data class RiderSnapshot(
    val riderId: String? = null,
    val riderName: String? = null,
    val ponto: String? = null,
    val leader: String? = null,
    val ninetyNineId: String? = null,
    val cpf: String? = null,
    val phone: String? = null,
    val pix: String? = null,
    val birthday: String? = null,
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
    val servicePoints: List<ServicePoint>? = null,
    val serverTier: ServerTier? = null,
    val mallOrders: List<MallOrder>? = null,
    val messages: List<MemberMessage>? = null,
    val unreadMessages: Int? = null,
    val coupons: List<MallCoupon>? = null,
    val badges: List<RiderBadge>? = null,
    val pointCashRateBRL: Double? = null,
)

/**
 * Result of an OTP request: ok=code sent; needsCpf=phone unknown, ask CPF to
 * rebind (or sign up); activatedName set = the backend activated the member
 * instantly without a code (Google guest + brand-new phone).
 */
data class OtpResult(
    val ok: Boolean,
    val rebind: Boolean = false,
    val needsCpf: Boolean = false,
    val activatedName: String? = null,
    val activatedId: String? = null,
    val error: String? = null,
)

/**
 * Google login: ok=signed in (needsVerification=true means the session is a
 * Google guest — browsing works, wallet/points unlock after phone verify in
 * Profile); needsLink=server wants an explicit phone+CPF bind (lite login off).
 */
data class GoogleResult(
    val ok: Boolean,
    val id: String? = null,
    val name: String? = null,
    val needsVerification: Boolean = false,
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

    /**
     * OTP step 1 — request a code for [phone]; pass [cpf] to (re)bind a new
     * number, or [signup] (name…) so a brand-new user is created on verify —
     * the same phone-first signup the web /register page uses.
     */
    suspend fun requestOtp(phone: String, cpf: String?, signup: SignupPayload? = null): OtpResult = try {
        val resp = service.requestOtp(MemberLoginRequest(phone, action = "request-otp", cpf = cpf, signup = signup))
        val d = resp.data
        when {
            // Google guest + new phone: the backend issues the session directly.
            d?.name != null && d.sent != true -> OtpResult(ok = true, activatedName = d.name, activatedId = d.id)
            d?.sent == true -> OtpResult(ok = true, rebind = d.rebind == true)
            d?.needsCpf == true -> OtpResult(ok = false, needsCpf = true)
            else -> OtpResult(ok = false, error = resp.error ?: "Falha ao enviar código")
        }
    } catch (e: Exception) {
        OtpResult(ok = false, error = e.message)
    }

    /** OTP step 2 — verify [code]; optionally bind a Google account on success. */
    suspend fun verifyOtp(phone: String, code: String, googleCredential: String? = null): Result<Pair<String, String?>> = try {
        val resp = service.verifyOtp(MemberLoginRequest(phone, action = "verify-otp", code = code, googleCredential = googleCredential))
        val name = resp.data?.name
        if (name != null) Result.success(name to resp.data.id)
        else Result.failure(IllegalStateException(resp.error ?: "Código inválido"))
    } catch (e: Exception) {
        Result.failure(e)
    }

    /** Sign in with Google: verified ID token → linked rider, or needsLink. */
    suspend fun googleLogin(credential: String): GoogleResult = try {
        val resp = service.googleLogin(GoogleLoginRequest(credential = credential))
        val d = resp.data
        when {
            // GOOGLE_LITE_LOGIN guest session: signed in right away; the app
            // flags the account so Profile offers the phone verification that
            // unlocks wallet/points (backend keeps them locked until then).
            (d?.needsVerification == true || d?.verified == false) && d.name != null ->
                GoogleResult(ok = true, id = d.id, name = d.name, needsVerification = true)
            d?.name != null -> GoogleResult(ok = true, id = d.id, name = d.name)
            d?.needsLink == true -> GoogleResult(ok = false, needsLink = true, email = d.email)
            else -> GoogleResult(ok = false, error = resp.error ?: "Falha no Google")
        }
    } catch (e: Exception) {
        GoogleResult(ok = false, error = e.message)
    }

    fun logout() = api.cookieJar.clear()

    /** Submit a slot application → null on success, failure reason otherwise. */
    suspend fun enrollSlot(slotApiId: String): String? = try {
        val resp = service.enrollSlot(SlotEnrollRequest(slotId = slotApiId))
        if (resp.data != null) null else resp.error ?: "Falha ao inscrever"
    } catch (e: Exception) {
        errorOf(e)
    }

    /** Pulls wallet → points → catalog → slots for the logged-in rider. */
    suspend fun loadSnapshot(riderName: String): RiderSnapshot {
        val walletEnv = runCatching { service.wallet(riderName) }.getOrNull()
        val me = walletEnv?.data?.me
        val riderId = me?.riderId

        val pointsEnv = riderId?.let { id -> runCatching { service.points(id) }.getOrNull() }
        // Strictly the rider's own account — never fall back to someone else's.
        val account = pointsEnv?.data?.accounts?.firstOrNull { it.riderId == riderId }
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

        // Real task progress (claimable/claimed) — richer than home.missions.
        val tasks = runCatching { service.tasks() }.getOrNull()?.data?.tasks

        return RiderSnapshot(
            riderId = profile?.riderId ?: riderId,
            riderName = profile?.name ?: me?.name,
            ponto = profile?.ponto ?: slotPonto,
            leader = profile?.leader,
            ninetyNineId = profile?.ninetyNineId,
            cpf = profile?.cpf ?: me?.cpf,
            phone = profile?.phone ?: me?.phone,
            pix = profile?.pix ?: me?.pix,
            birthday = profile?.birthday,
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
            missions = tasks?.mapNotNull { it.toMission() } ?: home?.missions?.map { it.toDomain() },
            inbox = home?.inbox?.map { it.toDomain() },
            servicePoints = home?.pontos?.mapNotNull { it.toDomain() },
            serverTier = home?.tier?.toDomain(),
            mallOrders = home?.mallOrders?.mapNotNull { it.toDomain() },
            messages = home?.messages?.mapNotNull { it.toDomain() },
            unreadMessages = home?.unreadMessages,
            coupons = home?.coupons?.mapNotNull { it.toDomain() },
            badges = home?.badges?.mapNotNull { b ->
                val lb = b.label ?: return@mapNotNull null
                RiderBadge(b.at ?: 0, b.icon ?: "", lb, b.achieved == true)
            },
            pointCashRateBRL = home?.pointCashRateBRL,
        )
    }

    /** GET /rider/profile (best-effort). */
    suspend fun fetchRiderProfile(): RiderProfileDto? =
        runCatching { service.riderProfile() }.getOrNull()?.data

    /**
     * Public data any visitor can see BEFORE logging in: the mall catalog and
     * the service-point map. Keeps the guest experience from being blank.
     */
    suspend fun loadPublicSnapshot(): RiderSnapshot {
        val catalogEnv = runCatching { service.catalog() }.getOrNull()
        val products = catalogEnv?.data
            ?.filter { it.status == null || it.status == "active" }
            ?.mapIndexedNotNull { idx, p -> p.toMallProduct(idx) }
        val pontosEnv = runCatching { service.pontosPublic() }.getOrNull()
        val pontos = pontosEnv?.data?.mapNotNull { it.toDomain() }
        return RiderSnapshot(products = products, servicePoints = pontos)
    }

    /** Human-readable failure reason from an HTTP error body ({"error": …}). */
    private fun errorOf(t: Throwable): String = when (t) {
        is retrofit2.HttpException -> try {
            val body = t.response()?.errorBody()?.string()
            org.json.JSONObject(body ?: "{}").optString("error").ifBlank { "Erro ${t.code()}" }
        } catch (_: Exception) {
            "Erro ${t.code()}"
        }
        else -> t.message ?: "Sem conexão"
    }

    /** POST /tasks {action:"claim"} → null on success, error message otherwise. */
    suspend fun claimTask(taskId: String): String? = try {
        val resp = service.claimTask(TaskClaimRequest(taskId))
        if (resp.data != null) null else resp.error ?: "Falha ao resgatar"
    } catch (e: Exception) {
        errorOf(e)
    }

    /** POST /mall markMessagesRead (best-effort). */
    suspend fun markMessagesRead(riderId: String?) {
        runCatching { service.markMessagesRead(MallMarkReadRequest(riderId)) }
    }

    // ----- Write paths — every write reports WHY it failed (null = ok) -----

    /** POST /wallet {action:"requestWithdrawal"} — identity is session-derived. */
    suspend fun requestWithdrawal(riderName: String, amount: Double): String? = try {
        service.requestWithdrawal(WithdrawRequest(riderName = riderName, amount = amount))
        null
    } catch (e: Exception) {
        errorOf(e)
    }

    /** POST /mall {action:"redeem"} — session identity; pickupStoreId for
     *  physical goods when the rider has no locked home station. */
    suspend fun redeem(productApiId: String, riderId: String? = null, pickupStoreId: String? = null): String? = try {
        service.redeem(MallRedeemRequest(productId = productApiId, riderId = riderId, pickupStoreId = pickupStoreId))
        null
    } catch (e: Exception) {
        errorOf(e)
    }

    /** POST /slots {action:"cancelEnrollment"} — needs the enrollment id, not the slot id. */
    suspend fun cancelSlot(enrollmentApiId: String): String? = try {
        service.cancelSlot(SlotCancelRequest(enrollmentId = enrollmentApiId))
        null
    } catch (e: Exception) {
        errorOf(e)
    }

    /** POST /checkin → awarded points (null on failure / already checked in). */
    suspend fun checkin(pontoCode: String): Int? =
        runCatching { service.checkin(CheckinRequest(pontoCode)) }.getOrNull()?.data?.awarded

    /** POST /rider/profile → null on success, failure reason otherwise. */
    suspend fun updateProfile(name: String, cpf: String, phone: String, pix: String, birthday: String? = null): String? = try {
        service.updateProfile(ProfileUpdateRequest(name, cpf, phone, pix, birthday))
        null
    } catch (e: Exception) {
        errorOf(e)
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
        // Mirror the backend's getAvailablePoints: earn-side types add the raw
        // value (an "adjust" may legitimately be negative), spend-side subtract.
        val signed = if ((type ?: "") in EARN_TYPES) mag else -abs(mag)
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
        tshHours = onlineHours ?: tshHours ?: 0.0,
        acceptanceRate = acceptanceRate ?: 0,
        cancelledOrders = cancelledOrders ?: 0,
        date = date ?: "",
        tshPercent = tshPercent,
        weekOrders = weekOrders,
        weekOnlineHours = weekOnlineHours,
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

    private fun ServerTierDto.toDomain(): ServerTier? {
        val t = tier ?: return null
        return ServerTier(
            tier = t,
            label = label ?: t,
            earnedInWindow = earnedInWindow ?: 0,
            nextTierAt = nextTierAt,
            nextTierLabel = nextTierLabel,
            redeemDiscount = redeemDiscount ?: 1.0,
            windowDays = windowDays ?: 0,
            ladder = ladder?.mapNotNull { step ->
                val lb = step.label ?: return@mapNotNull null
                TierStep(step.tier ?: lb, lb, step.minEarned ?: 0)
            } ?: emptyList(),
        )
    }

    private fun MallOrderDto.toDomain(): MallOrder? {
        val oid = id ?: return null
        return MallOrder(
            id = oid,
            productName = productName ?: "—",
            pointsSpent = pointsSpent ?: 0,
            status = status ?: "",
            createdAt = createdAt ?: "",
            pickupStoreName = pickupStoreName ?: "",
            voucherCode = voucherCode ?: "",
        )
    }

    private fun PontoDto.toDomain(): ServicePoint? {
        val nm = name ?: return null
        return ServicePoint(
            id = id ?: nm,
            name = nm,
            bairro = bairro ?: "",
            address = address ?: "",
            leader = leader ?: "",
            latitude = latitude ?: lat ?: 0.0,
            longitude = longitude ?: lng ?: 0.0,
        )
    }

    private fun TaskDto.toMission(): Mission? {
        val t = title ?: return null
        val target = (target ?: 0).coerceAtLeast(1)
        return Mission(
            title = t,
            reward = "+${rewardPoints ?: 0} pts",
            progress = ((progress ?: 0.0) / target).toFloat().coerceIn(0f, 1f),
            id = id,
            claimable = claimable == true,
            claimed = claimed == true,
        )
    }

    private fun MemberMessageDto.toDomain(): MemberMessage? {
        val t = title ?: return null
        return MemberMessage(
            id = id ?: t,
            title = t,
            body = body ?: "",
            time = createdAt ?: "",
            read = read == true,
        )
    }

    private fun CouponDto.toDomain(): MallCoupon? {
        val t = title ?: return null
        val v = value ?: 0
        return MallCoupon(
            id = id ?: t,
            title = t,
            valueLabel = if (type == "percent_off") "-$v%" else "-$v pts",
            minPoints = minPoints ?: 0,
            expiresAt = expiresAt ?: "",
        )
    }

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
            category = category ?: type ?: "",
            points = pointsPrice ?: 0,
            icon = Icons.Filled.ShoppingBag,
            stock = stock ?: 0,
            apiId = id,
            imageUrl = imageUrl?.takeIf { it.isNotBlank() },
            description = description ?: "",
            isVirtual = isVirtual == true,
            cashPriceBRL = cashPriceBRL ?: 0.0,
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
            enrollmentApiId = active?.id,
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
