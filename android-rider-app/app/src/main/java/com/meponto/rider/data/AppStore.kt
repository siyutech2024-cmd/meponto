package com.meponto.rider.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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

    val checkInReward = 50

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

    // Not modelled on the backend yet → stays empty (hidden), never faked.
    val todayStats: List<StatCard> = emptyList() // derive from performance later

    // Static app config (not user data): the tier ladder reference and the
    // support action shortcuts. These are presentation config, not mock figures.
    val tiers = MockData.tiers
    val helpActions = MockData.helpActions

    var pointsLedger by mutableStateOf<List<PointsLedgerEntry>>(emptyList())
        private set

    // Stable per-rider payloads encoded in the QR codes.
    val myQRPayload: String get() = "meponto://rider/${profile.ninetyNineId}"
    val inviteQRPayload: String get() = "meponto://invite/${profile.ninetyNineId}"

    // Each rider is bound to a Ponto: they only see / can sign up for shifts at
    // their own station. All schedule queries below are scoped to profile.ponto.
    val riderShifts: List<Shift> get() = shifts.filter { it.zone == profile.ponto }

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
                s.apiId?.let { id -> scope.launch { repo?.cancelSlot(id) } }
            }
            s.openSpots > 0 -> {
                // New signups enter the approval queue (Em análise), matching the
                // web dispatch flow where the station/franchise reviews them.
                shifts[i] = s.copy(status = ShiftSignupStatus.SUBMITTED, takenSpots = s.takenSpots + 1)
                s.apiId?.let { id -> scope.launch { repo?.enrollSlot(id) } }
            }
        }
    }

    /** Returns true if the redemption succeeded (enough points and stock). */
    fun redeem(product: MallProduct): Boolean {
        val i = products.indexOfFirst { it.id == product.id }
        if (i < 0 || pointsBalance < product.points || products[i].stock <= 0) return false
        pointsBalance -= product.points
        products[i] = products[i].copy(stock = products[i].stock - 1)
        product.apiId?.let { id -> scope.launch { repo?.redeem(id) } }
        return true
    }

    fun requestWithdraw() {
        val amount = wallet.available
        if (amount <= 0.0) return
        wallet = wallet.copy(pending = wallet.pending + amount, available = 0.0)
        scope.launch { repo?.requestPayout(null) }
    }

    /** Update identity / payout details (Profile › Personal info). */
    fun updateProfile(name: String, cpf: String, phone: String, pix: String) {
        profile = profile.copy(name = name, cpf = cpf, phone = phone, pix = pix)
        riderName = name.split(" ").firstOrNull() ?: name
        scope.launch { repo?.updateProfile(name, cpf, phone, pix) }
    }

    /** Station check-in (扫码签到): awards points; best-effort backend write. */
    fun checkIn(pontoCode: String): Int {
        pointsBalance += checkInReward
        scope.launch { repo?.checkin(pontoCode) }
        return checkInReward
    }

    // MARK: - Live hydration (apply PontoSys API snapshot; nulls keep mock)
    fun apply(snapshot: RiderSnapshot) {
        // Merge identity fields into the profile in one copy.
        var p = profile
        snapshot.riderName?.takeIf { it.isNotBlank() }?.let { riderName = it; p = p.copy(name = it) }
        snapshot.ponto?.takeIf { it.isNotBlank() }?.let { p = p.copy(ponto = it) }
        snapshot.leader?.takeIf { it.isNotBlank() }?.let { p = p.copy(leader = it) }
        snapshot.ninetyNineId?.takeIf { it.isNotBlank() }?.let { p = p.copy(ninetyNineId = it) }
        snapshot.cpf?.let { p = p.copy(cpf = it) }
        snapshot.phone?.let { p = p.copy(phone = it) }
        snapshot.pix?.let { p = p.copy(pix = it) }
        // Tier metrics (drive the membership tier).
        snapshot.ar?.let { p = p.copy(ar = it) }
        snapshot.nightShiftCount?.let { p = p.copy(nightShiftCount = it) }
        snapshot.incidentCount?.let { p = p.copy(incidentCount = it) }
        profile = p

        snapshot.shifts?.takeIf { it.isNotEmpty() }?.let {
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
        snapshot.pointsLedger?.takeIf { it.isNotEmpty() }?.let { pointsLedger = it }
        snapshot.products?.takeIf { it.isNotEmpty() }?.let {
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
