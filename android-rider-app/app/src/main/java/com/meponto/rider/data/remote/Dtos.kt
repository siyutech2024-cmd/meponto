package com.meponto.rider.data.remote

/**
 * DTOs for the PontoSys API (docs/api.md). Most endpoints wrap their payload in
 * an `{ "data": ... }` envelope. Fields are nullable so a partial / changed
 * response never crashes the parser — the repository falls back to mock data.
 */
data class ApiEnvelope<T>(val data: T? = null, val error: String? = null, val needsCpf: Boolean? = null)

// POST /api/member-login  { phone, action?, code?, cpf? }
// action null = legacy phone-only login; "request-otp" / "verify-otp" = OTP flow.
data class MemberLoginRequest(
    val phone: String,
    val action: String? = null,
    val code: String? = null,
    val cpf: String? = null,
    val googleCredential: String? = null,
)

// POST /api/member-login { action: "google", credential }
data class GoogleLoginRequest(val credential: String, val action: String = "google")
data class GoogleLoginData(
    val name: String? = null,
    val needsLink: Boolean? = null,
    val email: String? = null,
)

// data for action=request-otp
data class OtpRequestData(
    val sent: Boolean? = null,
    val rebind: Boolean? = null,
    val needsCpf: Boolean? = null,
    val devCode: String? = null,
)
data class MemberLoginData(
    val name: String? = null,
    val role: String? = null,
    val portal: String? = null,
    val organization: String? = null,
)

// GET /api/wallet?riderName=...  → data.me + data.withdrawals
data class WalletData(
    val me: WalletMe? = null,
    val withdrawals: List<WithdrawalDto>? = null,
)

data class WalletMe(
    val riderId: String? = null,
    val name: String? = null,
    val pix: String? = null,
    val cpf: String? = null,
    val phone: String? = null,
    val station: String? = null,
    val franchise: String? = null,
    val settled: Double? = null,
    val held: Double? = null,
    val paid: Double? = null,
    val available: Double? = null,
)

data class WithdrawalDto(
    val id: String? = null,
    val amount: Double? = null,
    val status: String? = null,
    val requestedAt: String? = null,
    val paidAt: String? = null,
    val pix: String? = null,
)

// POST /api/wallet { action: "requestWithdrawal", riderName, amount }
data class WithdrawRequest(
    val action: String = "requestWithdrawal",
    val riderName: String,
    val amount: Double,
)

// GET /api/points?riderId=...  → data.accounts + data.ledger
data class PointsData(
    val accounts: List<PointsAccountDto>? = null,
    val ledger: List<PointsLedgerDto>? = null,
)

data class PointsAccountDto(
    val riderId: String? = null,
    val accountId: String? = null,
    val available: Int? = null,
    val pending: Int? = null,
)

data class PointsLedgerDto(
    val id: String? = null,
    val type: String? = null,
    val points: Int? = null,
    val status: String? = null,
    val sourceType: String? = null,
    val note: String? = null,
    val reasonCode: String? = null,
    val createdAt: String? = null,
    val balanceAfter: Int? = null,
)

// GET /api/slots → data.slots + data.enrollments + data.weekStatus
data class SlotsData(
    val slots: List<RiderSlotDto>? = null,
    val enrollments: List<SlotEnrollmentDto>? = null,
    val weekStatus: String? = null,
)

data class RiderSlotDto(
    val id: String? = null,
    val date: String? = null,
    val weekday: String? = null,
    val startTime: String? = null,
    val endTime: String? = null,
    val capacity: Int? = null,
    val enrolled: Int? = null,
    val status: String? = null,
    val priority: Boolean? = null,
    val pontoName: String? = null,
    val franchiseName: String? = null,
    val quotaNote: String? = null,
)

data class SlotEnrollmentDto(
    val id: String? = null,
    val slotId: String? = null,
    val status: String? = null,
)

// POST /api/slots { slotId, riderTier?, note? }
data class SlotEnrollRequest(
    val slotId: String,
    val riderTier: Int? = null,
    val note: String? = null,
)

// GET /api/marketplace/catalog → data: [product]
data class CatalogProductDto(
    val id: String? = null,
    val name: String? = null,
    val pointsPrice: Int? = null,
    val stock: Int? = null,
    val category: String? = null,
    val imageUrl: String? = null,
    val status: String? = null,
)

// GET /rider/profile — authoritative identity (overrides wallet fields)
data class RiderProfileDto(
    val riderId: String? = null,
    val name: String? = null,
    val cpf: String? = null,
    val phone: String? = null,
    val pix: String? = null,
    val ponto: String? = null,
    val leader: String? = null,
    val ninetyNineId: String? = null,
    // Tier metrics — drive the membership tier on Home.
    val ar: Int? = null,
    val nightShiftCount: Int? = null,
    val incidentCount: Int? = null,
)

// GET /rider/home — dashboard aggregate (real collections; empty when no data)
data class RiderHomeDto(
    val performance: PerformanceDto? = null,
    val weeklyGoalProgress: Int? = null,
    val cashLedger: List<LedgerDto>? = null,
    val partners: List<PartnerDto>? = null,
    val partnerBenefits: List<PartnerBenefitDto>? = null,
    val missions: List<MissionDto>? = null,
    val inbox: List<InboxDto>? = null,
)

data class PartnerBenefitDto(
    val partner: String? = null,
    val service: String? = null,
    val discount: String? = null,
    val status: String? = null,
    val tone: String? = null,
)

data class PerformanceDto(
    val orders: Int? = null,
    val tshHours: Double? = null,
    val acceptanceRate: Int? = null,
    val cancelledOrders: Int? = null,
)

data class LedgerDto(
    val title: String? = null,
    val subtitle: String? = null,
    val amount: String? = null,
    val status: String? = null,
    val tone: String? = null,
)

data class PartnerDto(
    val id: String? = null,
    val name: String? = null,
    val neighborhood: String? = null,
    val category: String? = null,
    val services: String? = null,
    val discountBRL: Int? = null,
    val partnerPoints: Int? = null,
    val distance: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

data class MissionDto(
    val title: String? = null,
    val reward: String? = null,
    val progress: Float? = null,
)

data class InboxDto(
    val title: String? = null,
    val detail: String? = null,
    val time: String? = null,
)

// Generic write acknowledgement
data class AckDto(val id: String? = null, val status: String? = null)

// POST /rider/checkin → { points, checkinId }
data class CheckinDto(val points: Int? = null, val checkinId: String? = null)

// POST /push — register/unregister this device's FCM token
data class PushTokenRequest(
    val action: String, // "registerToken" | "unregisterToken"
    val token: String,
    val riderName: String? = null,
    val platform: String? = null,
)

// ----- Write request bodies (all writes carry an Idempotency-Key header) -----
data class ProfileUpdateRequest(val name: String, val cpf: String, val phone: String, val pix: String)
data class PayoutRequest(val amount: Double? = null) // null = full available
data class RedeemRequest(val productId: String, val qty: Int = 1)
data class SlotCancelRequest(val slotId: String)
data class CheckinRequest(val pontoCode: String, val lat: Double? = null, val lng: Double? = null)
