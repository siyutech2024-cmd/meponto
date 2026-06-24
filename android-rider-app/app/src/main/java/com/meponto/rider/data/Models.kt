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
    val tshHours: Double,
    val acceptanceRate: Int,
    val cancelledOrders: Int,
)

data class Mission(
    val title: String,
    val reward: String,
    val progress: Float, // 0f..1f
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
) {
    val isEarn: Boolean get() = points >= 0
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
