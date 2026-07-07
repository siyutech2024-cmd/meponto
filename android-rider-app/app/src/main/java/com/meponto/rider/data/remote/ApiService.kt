package com.meponto.rider.data.remote

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * PontoSys rider-facing endpoints. The session cookie (meponto_session) set by
 * member-login is captured by the OkHttp cookie jar and resent automatically.
 */
interface ApiService {

    // Sign in with Google → linked rider session, or needsLink to bind.
    @POST("member-login")
    suspend fun googleLogin(@Body body: GoogleLoginRequest): ApiEnvelope<GoogleLoginData>

    // OTP login: request a code, then verify it (both hit member-login).
    @POST("member-login")
    suspend fun requestOtp(@Body body: MemberLoginRequest): ApiEnvelope<OtpRequestData>

    @POST("member-login")
    suspend fun verifyOtp(@Body body: MemberLoginRequest): ApiEnvelope<MemberLoginData>

    @GET("wallet")
    suspend fun wallet(@Query("riderName") riderName: String): ApiEnvelope<WalletData>

    @POST("wallet")
    suspend fun requestWithdrawal(@Body body: WithdrawRequest): ApiEnvelope<WalletData>

    @GET("points")
    suspend fun points(@Query("riderId") riderId: String): ApiEnvelope<PointsData>

    @GET("marketplace/catalog")
    suspend fun catalog(): ApiEnvelope<List<CatalogProductDto>>

    @GET("slots")
    suspend fun slots(): ApiEnvelope<SlotsData>

    @POST("slots")
    suspend fun enrollSlot(@Body body: SlotEnrollRequest): ApiEnvelope<SlotEnrollmentDto>

    // ----- Identity -----
    @GET("rider/profile")
    suspend fun riderProfile(): ApiEnvelope<RiderProfileDto>

    @POST("rider/profile")
    suspend fun updateProfile(@Body body: ProfileUpdateRequest): ApiEnvelope<AckDto>

    // ----- Home dashboard aggregate (performance / ledger / partners / …) -----
    @GET("rider/home")
    suspend fun riderHome(): ApiEnvelope<RiderHomeDto>

    // ----- Write paths (Idempotency-Key added by interceptor) -----
    // Withdrawals go through POST /api/wallet {action:"requestWithdrawal"} —
    // see requestWithdrawal above (there is no /rider/payout endpoint).

    @POST("mall")
    suspend fun redeem(@Body body: MallRedeemRequest): ApiEnvelope<MallRedeemData>

    // Cancel = POST /api/slots {action:"cancelEnrollment", enrollmentId}.
    @POST("slots")
    suspend fun cancelSlot(@Body body: SlotCancelRequest): ApiEnvelope<AckDto>

    @POST("checkin")
    suspend fun checkin(@Body body: CheckinRequest): ApiEnvelope<CheckinDto>

    // ----- Push (FCM token registration) -----
    @POST("push")
    suspend fun registerPush(@Body body: PushTokenRequest): ApiEnvelope<AckDto>
}
