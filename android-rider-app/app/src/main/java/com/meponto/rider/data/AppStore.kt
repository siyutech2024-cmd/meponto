package com.meponto.rider.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * App-wide observable store backed by Compose snapshot state. Mutations (redeem,
 * subscribe, withdraw) are kept in memory for local testing — mirrors the iOS
 * AppStore. Reading any property inside a composable subscribes it to changes.
 */
class AppStore {

    // Real data only — empty until the PontoSys API hydrates after member login.
    // No demo persona/figures ship in the binary (avoids fake data on launch).
    var riderName by mutableStateOf("")
        private set

    // 会员资料 / membership identity (网点 / 队长 / 片区 / 99 ID + 等级输入)
    var profile by mutableStateOf(
        MembershipProfile(
            name = "",
            ponto = "",
            leader = "",
            bairro = "",
            ninetyNineId = "",
            ar = 0,
            nightShiftCount = 0,
            incidentCount = 0,
            cpf = "",
            phone = "",
            pix = "",
        )
    )
        private set

    var pointsBalance by mutableStateOf(0)
        private set

    var wallet by mutableStateOf(
        WalletState(available = 0.0, pending = 0.0, weeklyGoalProgress = 0)
    )
        private set

    val shifts = mutableStateListOf<Shift>()
    val products = mutableStateListOf<MallProduct>()

    // Backend: set after login; null in guest/demo → writes degrade to local-only.
    private var repo: RiderRepository? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    fun attach(repo: RiderRepository) { this.repo = repo }

    // PontoSys rider id + the name used at login (both needed to re-pull).
    var riderId by mutableStateOf<String?>(null)
        private set
    private var loginName: String? = null

    /** Seed the rider id captured at login (referral/partner QR links need it
     *  even before the first full hydration). API snapshots may refine it. */
    fun seedRiderId(id: String?) {
        if (riderId == null && !id.isNullOrBlank()) riderId = id
    }

    /** Pull a fresh snapshot for [name] and apply it (login-time hydration). */
    suspend fun hydrate(name: String) {
        loginName = name
        repo?.let { apply(it.loadSnapshot(name)) }
    }

    /**
     * Manual re-pull for pull-to-refresh (排班/首页下拉刷新): re-applies the
     * latest server snapshot without needing to relaunch the app. No-op for
     * guests (no login name yet). Suspends until the refresh completes so the
     * pull-to-refresh spinner can await it.
     */
    suspend fun refresh() {
        val r = repo ?: return
        val n = loginName ?: return
        runCatching { apply(r.loadSnapshot(n)) }
    }

    /**
     * Re-sync with the backend after any write. Local mutations are optimistic;
     * the backend is the ledger of record (it may reject: insufficient balance,
     * already-checked-in, non-cancellable enrollment…), so we always reconcile.
     */
    private fun syncAfterWrite() {
        val r = repo ?: return
        val n = loginName ?: return
        scope.launch { runCatching { apply(r.loadSnapshot(n)) } }
    }

    // Live, per-rider data from GET /rider/home (real collections only). Empty
    // until the API hydrates; screens hide the section when empty, so no
    // fabricated figures ever show. See docs/rider-app-data-closed-loop.md.
    var performance by mutableStateOf<Performance?>(null)
        private set
    var missions by mutableStateOf<List<Mission>>(emptyList())
        private set
    var inbox by mutableStateOf<List<InboxItem>>(emptyList())
        private set
    var cashLedger by mutableStateOf<List<LedgerEntry>>(emptyList())
        private set
    var partners by mutableStateOf<List<Partner>>(emptyList())
        private set
    var partnerBenefits by mutableStateOf<List<PartnerBenefit>>(emptyList())
        private set
    var servicePoints by mutableStateOf<List<ServicePoint>>(emptyList())
        private set
    // Backend-computed unified tier + the rider's own mall orders.
    var serverTier by mutableStateOf<ServerTier?>(null)
        private set
    var mallOrders by mutableStateOf<List<MallOrder>>(emptyList())
        private set
    var mallMessages by mutableStateOf<List<MemberMessage>>(emptyList())
        private set
    var unreadMessages by mutableStateOf(0)
        private set
    var coupons by mutableStateOf<List<MallCoupon>>(emptyList())
        private set
    var badges by mutableStateOf<List<RiderBadge>>(emptyList())
        private set
    // Referral progress (masked invitee names + reward status).
    var referrals by mutableStateOf<List<com.meponto.rider.data.remote.ReferralDto>>(emptyList())
        private set
    // R$ per point when a redemption's shortfall converts to cash (0 = off).
    var pointCashRateBRL by mutableStateOf(0.0)
        private set
    var statusTotals by mutableStateOf<StatusTotals?>(null)
        private set

    // Bumped whenever the on-device avatar photo changes (Member Card), so the
    // Home header re-reads the new photo without a relaunch.
    var avatarVersion by mutableIntStateOf(0)
        private set
    fun bumpAvatar() { avatarVersion += 1 }

    // One-shot user-facing notice (why a write was refused). Screens toast it.
    var notice by mutableStateOf<String?>(null)
        private set
    fun clearNotice() { notice = null }
    private fun report(error: String?) { if (error != null) notice = error }

    // Not modelled on the backend yet → stays empty (hidden), never faked.
    val todayStats: List<StatCard> = emptyList() // derive from performance later

    // Static app config (not user data): the tier ladder reference and the
    // support action shortcuts. These are presentation config, not mock figures.
    val tiers = MockData.tiers
    val helpActions = MockData.helpActions

    var pointsLedger by mutableStateOf<List<PointsLedgerEntry>>(emptyList())
        private set

    // QR payloads are REAL https URLs (any camera app can open them):
    //  - my QR   → /scan?ref=…      partner-discount + register landing page
    //  - invite  → /register?ref=…  signup with the inviter pre-filled (the
    //    backend credits referral points once the friend verifies by SMS).
    private val webBase: String =
        com.meponto.rider.BuildConfig.BASE_URL.removeSuffix("api/").removeSuffix("api")

    // ref fallback chain: rider id → 99 ID → name (the backend resolves all
    // three), so EVERY logged-in member always has a working referral link.
    private val refValue: String
        get() = riderId
            ?: profile.ninetyNineId.ifBlank { null }
            ?: profile.name

    val myQRPayload: String
        get() = "${webBase}scan?ref=${android.net.Uri.encode(refValue)}"
    val inviteQRPayload: String
        get() = "${webBase}register?ref=${android.net.Uri.encode(refValue)}"

    // Each rider is bound to a Ponto. GET /slots is already scoped server-side
    // by the session, so the local filter is only a safety net: match loosely
    // (trim + case-insensitive) and show everything when the profile has no
    // ponto yet — a name-format mismatch must not blank the whole screen.
    // GET /slots is scoped server-side by the session (and real dispatch
    // shifts are HOTZONE-based, not ponto-named), so the old zone==ponto
    // client filter only hid valid shifts. Trust the server.
    val riderShifts: List<Shift>
        get() = shifts

    fun shiftsOn(dateKey: String): List<Shift> = riderShifts.filter { it.dateKey == dateKey }

    // Agenda = the rider's own subscribed shifts (already ponto-scoped).
    val subscribedShifts: List<Shift>
        get() = riderShifts.filter { it.subscribed }.sortedBy { it.dateKey }

    // Rider's shifts grouped into weeks (this week, next week, …), each week a
    // list of its days. Sorted chronologically.
    val riderWeeks: List<List<ScheduleDay>>
        get() {
            val groups = LinkedHashMap<String, MutableList<String>>()
            for (key in riderShifts.map { it.dateKey }.toSortedSet()) {
                groups.getOrPut(weekKey(key)) { mutableListOf() }.add(key)
            }
            return groups.keys.sorted().map { wk -> daysFor(groups[wk]!!) }
        }

    private fun daysFor(keys: List<String>): List<ScheduleDay> =
        keys.sorted().map { key ->
            val day = riderShifts.filter { it.dateKey == key }
            ScheduleDay(
                id = key,
                weekday = day.firstOrNull()?.weekday ?: "",
                dayLabel = day.firstOrNull()?.dayLabel ?: "",
                shiftIds = day.map { it.id },
                subscribedCount = day.count { it.subscribed },
            )
        }

    // MARK: - Mutations
    fun toggleSubscription(shift: Shift) {
        val i = shifts.indexOfFirst { it.id == shift.id }
        if (i < 0) return
        val s = shifts[i]
        when {
            s.subscribed -> {
                shifts[i] = s.copy(status = ShiftSignupStatus.NONE, takenSpots = (s.takenSpots - 1).coerceAtLeast(0))
                // Cancel needs the ENROLLMENT id (the backend also refuses to
                // cancel confirmed enrollments — the re-sync restores those).
                s.enrollmentApiId?.let { id -> scope.launch { report(repo?.cancelSlot(id)); syncAfterWrite() } }
            }
            s.openSpots > 0 -> {
                // New signups enter the approval queue (Em análise), matching the
                // web dispatch flow where the station/franchise reviews them.
                shifts[i] = s.copy(status = ShiftSignupStatus.SUBMITTED, takenSpots = s.takenSpots + 1)
                Analytics.log("shift_enroll", mapOf("window" to s.window))
                s.apiId?.let { id -> scope.launch { report(repo?.enrollSlot(id)); syncAfterWrite() } }
            }
        }
    }

    /**
     * Returns true if the redemption succeeded. Affordability matches the
     * SERVER'S rule, not the old points-only check: when shortfall→cash
     * conversion is on (pointCashRateBRL > 0) the backend accepts orders with
     * fewer points than the price and charges the difference in cash, so the
     * client must not pre-reject them ("Pontos insuficientes" on a redeemable
     * product — field feedback 2026-07-17). Server stays authoritative; the
     * post-write re-sync reconciles the optimistic numbers.
     */
    fun redeem(product: MallProduct, pickupStoreId: String? = null): Boolean {
        val i = products.indexOfFirst { it.id == product.id }
        if (i < 0 || products[i].stock <= 0) return false
        val shortfallOk = pointCashRateBRL > 0
        if (pointsBalance < product.points && !shortfallOk) return false
        pointsBalance = (pointsBalance - product.points).coerceAtLeast(0)
        products[i] = products[i].copy(stock = products[i].stock - 1)
        Analytics.log("redeem_order", mapOf("product" to product.name, "points" to "${product.points}"))
        product.apiId?.let { id -> scope.launch { report(repo?.redeem(id, riderId, pickupStoreId)); syncAfterWrite() } }
        return true
    }

    fun requestWithdraw() {
        val amount = wallet.available
        if (amount <= 0.0) return
        val name = profile.name.ifBlank { loginName ?: return }
        wallet = wallet.copy(pending = wallet.pending + amount, available = 0.0)
        // POST /wallet {action:"requestWithdrawal"} — amount is required (the
        // backend has no "null = full"); it may refuse (profile incomplete,
        // pending withdrawal, insufficient T+1 balance) → re-sync reconciles.
        scope.launch { report(repo?.requestWithdrawal(name, amount)); syncAfterWrite() }
    }

    /** Update identity / payout details (Profile › Personal info). */
    fun updateProfile(name: String, cpf: String, phone: String, pix: String, birthday: String = "") {
        profile = profile.copy(name = name, cpf = cpf, phone = phone, pix = pix, birthday = birthday)
        riderName = name.split(" ").firstOrNull() ?: name
        scope.launch { report(repo?.updateProfile(name, cpf, phone, pix, birthday.ifBlank { null })); syncAfterWrite() }
    }

    /**
     * Station check-in (扫码签到) — SERVER-AUTHORITATIVE. The backend validates
     * the QR (must be a real Ponto), enforces once-per-day, and decides the
     * award. Returns the awarded points, or null when rejected (invalid code /
     * already checked in / offline) — the UI must show a failure state, never
     * a fabricated +50.
     */
    suspend fun checkIn(pontoCode: String): Int? {
        val awarded = repo?.checkin(pontoCode)
        if (awarded != null) {
            Analytics.log("station_check_in", mapOf("points" to "$awarded"))
            syncAfterWrite()
        }
        return awarded
    }

    /**
     * Cancel an in-transit redemption (server refunds points + prepaid cash and
     * restocks). Returns null on success, else the pt-BR refusal reason.
     */
    suspend fun cancelOrder(orderId: String): String? {
        val r = repo ?: return "offline"
        val error = r.cancelOrder(orderId, riderId)
        if (error == null) syncAfterWrite()
        return error
    }

    /** Station / partner reviews for a map pin ("ponto-…" / "partner-…"). */
    suspend fun reviewsFor(targetCode: String): com.meponto.rider.data.remote.ReviewsData? =
        repo?.reviews(targetCode)

    suspend fun submitReview(targetCode: String, rating: Int, comment: String): String? =
        repo?.submitReview(targetCode, rating, comment) ?: "offline"

    suspend fun myTickets(): List<com.meponto.rider.data.remote.SupportTicketDto> =
        repo?.myTickets(profile.name.ifBlank { riderName }) ?: emptyList()

    suspend fun createTicket(subject: String, message: String): String? {
        Analytics.log("support_ticket")
        return repo?.createTicket(
            authorName = profile.name.ifBlank { riderName },
            contact = profile.phone,
            organization = profile.ponto.ifBlank { null },
            subject = subject,
            message = message,
        ) ?: "offline"
    }

    // MARK: - Live hydration (apply PontoSys API snapshot; nulls keep mock)
    fun apply(snapshot: RiderSnapshot) {
        snapshot.riderId?.takeIf { it.isNotBlank() }?.let { riderId = it }
        // Merge identity fields into the profile in one copy.
        var p = profile
        snapshot.riderName?.takeIf { it.isNotBlank() }?.let { riderName = it; p = p.copy(name = it) }
        snapshot.ponto?.takeIf { it.isNotBlank() }?.let { p = p.copy(ponto = it) }
        snapshot.leader?.takeIf { it.isNotBlank() }?.let { p = p.copy(leader = it) }
        snapshot.ninetyNineId?.takeIf { it.isNotBlank() }?.let { p = p.copy(ninetyNineId = it) }
        snapshot.cpf?.let { p = p.copy(cpf = it) }
        snapshot.phone?.let { p = p.copy(phone = it) }
        snapshot.pix?.let { p = p.copy(pix = it) }
        snapshot.birthday?.let { p = p.copy(birthday = it) }
        // Tier metrics (drive the membership tier).
        snapshot.ar?.let { p = p.copy(ar = it) }
        snapshot.nightShiftCount?.let { p = p.copy(nightShiftCount = it) }
        snapshot.incidentCount?.let { p = p.copy(incidentCount = it) }
        profile = p

        // Non-null = the API call succeeded → replace even with an empty list
        // (the backend removing everything must also reflect in the app).
        snapshot.shifts?.let {
            shifts.clear()
            shifts.addAll(it)
        }
        if (snapshot.walletAvailable != null || snapshot.walletPending != null || snapshot.weeklyGoalProgress != null) {
            wallet = wallet.copy(
                available = snapshot.walletAvailable ?: wallet.available,
                pending = snapshot.walletPending ?: wallet.pending,
                weeklyGoalProgress = snapshot.weeklyGoalProgress ?: wallet.weeklyGoalProgress,
            )
        }
        snapshot.pointsBalance?.let { pointsBalance = it }
        snapshot.pointsLedger?.let { pointsLedger = it }
        snapshot.products?.let {
            products.clear()
            products.addAll(it)
        }

        // Home dashboard aggregate (GET /rider/home). Nulls keep current.
        snapshot.performance?.let { performance = it }
        snapshot.cashLedger?.let { cashLedger = it }
        snapshot.partners?.let { partners = it }
        snapshot.partnerBenefits?.let { partnerBenefits = it }
        snapshot.missions?.let { missions = it }
        snapshot.inbox?.let { inbox = it }
        snapshot.servicePoints?.let { servicePoints = it }
        snapshot.serverTier?.let { serverTier = it }
        snapshot.mallOrders?.let { mallOrders = it }
        snapshot.messages?.let { mallMessages = it }
        snapshot.unreadMessages?.let { unreadMessages = it }
        snapshot.coupons?.let { coupons = it }
        snapshot.badges?.let { badges = it }
        snapshot.referrals?.let { referrals = it }
        snapshot.pointCashRateBRL?.let { pointCashRateBRL = it }
        snapshot.statusTotals?.let { statusTotals = it }
    }

    /** Claim a completed mission's reward (server awards ledger points). */
    fun claimMission(mission: Mission) {
        val id = mission.id ?: return
        scope.launch { report(repo?.claimTask(id)); syncAfterWrite() }
    }

    /** Mark mall messages read (badge clears immediately; server follows). */
    fun markMessagesRead() {
        if (unreadMessages == 0) return
        unreadMessages = 0
        mallMessages = mallMessages.map { it.copy(read = true) }
        scope.launch { repo?.markMessagesRead(riderId) }
    }

    private fun weekKey(dateKey: String): String {
        val d = try {
            SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(dateKey)
        } catch (_: Exception) {
            null
        } ?: return dateKey
        val cal = Calendar.getInstance().apply {
            firstDayOfWeek = Calendar.MONDAY
            minimalDaysInFirstWeek = 4
            time = d
        }
        return String.format(Locale.US, "%04d-W%02d", cal.get(Calendar.YEAR), cal.get(Calendar.WEEK_OF_YEAR))
    }
}

val LocalStore = staticCompositionLocalOf<AppStore> { error("AppStore not provided") }
