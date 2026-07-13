package com.meponto.rider.data

import androidx.compose.ui.graphics.vector.ImageVector
import com.meponto.rider.ui.theme.Tone

data class StatCard(
    val titleKey: String,
    val value: String,
    val icon: ImageVector,
    val tone: Tone,
)

data class Performance(
    val orders: Int,
    val tshHours: Double,          // real online HOURS (latest imported day)
    val acceptanceRate: Int,       // AR %
    val cancelledOrders: Int,      // CAA % (cancel rate)
    val date: String = "",         // which T+1 day this describes
    val tshPercent: Double? = null,
    val weekOrders: Int? = null,
    val weekOnlineHours: Double? = null,
)

data class StatusTotals(
    val totalOrders: Int,
    val onlineHours: Double,
    val ar: Double,
    val lastReportDate: String,
)

data class Mission(
    val title: String,
    val reward: String,
    val progress: Float, // 0f..1f
    val id: String? = null,        // backend task id (needed to claim)
    val claimable: Boolean = false,
    val claimed: Boolean = false,
)

/** Mall member message (chegou/retire notices, announcements). */
data class MemberMessage(
    val id: String,
    val title: String,
    val body: String,
    val time: String,
    val read: Boolean,
)

/** Storefront coupon (auto-applied at redemption; shown for transparency). */
data class MallCoupon(
    val id: String,
    val title: String,
    val valueLabel: String,   // "-50 pts" or "-10%"
    val minPoints: Int,
    val expiresAt: String,
)

data class InboxItem(
    val title: String,
    val detail: String,
    val time: String,
)

data class LedgerEntry(
    val title: String,
    val detail: String,
    val value: String,
    val status: String,
    val tone: Tone,
)

data class PartnerBenefit(
    val partner: String,
    val service: String,
    val discount: String,
    val status: String,
    val tone: Tone,
)

data class Tier(
    val score: Int,
    val metric: String,
    val detail: String,
    val threshold: String,
)

/** Shift signup status — mirrors the web dispatch approval flow. */
enum class ShiftSignupStatus {
    NONE, SUBMITTED, APPROVED, REJECTED;

    val key: String
        get() = when (this) {
            NONE -> "shift.status.none"
            SUBMITTED -> "shift.status.submitted"
            APPROVED -> "shift.status.approved"
            REJECTED -> "shifts.spots" // unused fallback
        }

    val tone: Tone
        get() = when (this) {
            NONE -> Tone.NEUTRAL
            SUBMITTED -> Tone.WARNING
            APPROVED -> Tone.OK
            REJECTED -> Tone.DANGER
        }
}

data class Shift(
    val id: Int,
    val zone: String,
    val station: String,
    val dateKey: String,   // "2026-06-23" — used to group/sort by day
    val weekday: String,   // "Seg"
    val dayLabel: String,  // "23/06"
    val window: String,
    val hotzone: String,   // demand area for the slot (no guaranteed pay)
    val totalSpots: Int,
    val takenSpots: Int,
    val critical: Boolean = false,
    val status: ShiftSignupStatus = ShiftSignupStatus.NONE,
    val apiId: String? = null, // PontoSys slot id (null for local mock shifts)
    val enrollmentApiId: String? = null, // active enrollment id (needed to self-cancel)
) {
    val subscribed: Boolean
        get() = status == ShiftSignupStatus.SUBMITTED || status == ShiftSignupStatus.APPROVED
    val openSpots: Int get() = (totalSpots - takenSpots).coerceAtLeast(0)
}

/** One day column in the weekly schedule grid. */
data class ScheduleDay(
    val id: String, // dateKey
    val weekday: String,
    val dayLabel: String,
    val shiftIds: List<Int>,
    val subscribedCount: Int,
)

data class MallProduct(
    val id: Int,
    val name: String,
    val category: String,
    val points: Int,
    val icon: ImageVector,
    val stock: Int,
    val apiId: String? = null, // PontoSys catalog id (null for local mock)
    val imageUrl: String? = null,
    val description: String = "",
    val isVirtual: Boolean = false,
    val cashPriceBRL: Double = 0.0,
)

/** Lifetime-order achievement badge. */
data class RiderBadge(val at: Int, val icon: String, val label: String, val achieved: Boolean)

/** Backend-computed membership tier — single standard across app and mall. */
data class ServerTier(
    val tier: String,          // member|bronze|prata|ouro|diamante
    val label: String,
    val earnedInWindow: Int,
    val nextTierAt: Int?,      // null at the top
    val nextTierLabel: String?,
    val redeemDiscount: Double,
    val windowDays: Int,
    val ladder: List<TierStep> = emptyList(),
)

/** One rung of the unified points-tier ladder (for the Home preview). */
data class TierStep(val tier: String, val label: String, val minEarned: Int)

/** One PontoMall redemption order (status flows created→arrived→picked up). */
data class MallOrder(
    val id: String,
    val productName: String,
    val pointsSpent: Int,
    val status: String,
    val createdAt: String,
    val pickupStoreName: String,
    val voucherCode: String,
)

/** A Ponto (service point) shown on the rider Map tab. */
data class ServicePoint(
    val id: String,
    val name: String,
    val bairro: String,
    val address: String,
    val leader: String,
    val latitude: Double,
    val longitude: Double,
)

data class Partner(
    val id: Int,
    val name: String,
    val neighborhood: String,
    val category: String,
    val services: String,
    val discountBRL: Int,
    val partnerPoints: Int,
    val distance: String,
    val latitude: Double,
    val longitude: Double,
)

/** Points ledger entry — signed points (+ earn / - spend). */
data class PointsLedgerEntry(
    val note: String,
    val source: String,
    val points: Int,
    val status: String,
    val createdAt: String = "",
) {
    val isEarn: Boolean get() = points >= 0

    /** Sortable "event date" — prefers the yyyy-MM-dd embedded in the note
     *  (the T+1 report date users actually see), falling back to createdAt.
     *  Used to show the ledger newest-first. */
    val sortKey: String
        get() = Regex("""\d{4}-\d{2}-\d{2}""").find(note)?.value
            ?: createdAt.take(10).ifBlank { "0000-00-00" }
}

data class HelpAction(
    val titleKey: String,
    val detail: String,
    val icon: ImageVector,
    val tone: Tone,
)

data class WalletState(
    val available: Double,
    val pending: Double,
    val weeklyGoalProgress: Int, // percent
)
