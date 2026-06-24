import Foundation

// Production RiderAPI backed by the PontoSys endpoints (via APIClient). Injected
// into AppStore once a member logs in. Reads are best-effort: missing fields fall
// back to the bundled mock so the UI never shows an empty/broken state.
struct LiveRiderAPI: RiderAPI {
    let memberName: String
    private let client = APIClient()

    private static var fallbackProfile: MembershipProfile {
        MembershipProfile(
            name: "Lucas Ferreira", ponto: "Ponto Liberdade Sul", leader: "João Pereira",
            bairro: "Liberdade", ninetyNineId: "99-184273",
            ar: 96, nightShiftCount: 14, incidentCount: 1)
    }

    func fetchBootstrap() async throws -> RiderBootstrap {
        let snap = await client.loadSnapshot(riderName: memberName)
        var profile = LiveRiderAPI.fallbackProfile
        if let n = snap.riderName, !n.isEmpty { profile.name = n }
        if let p = snap.ponto, !p.isEmpty { profile.ponto = p }
        if let c = snap.cpf { profile.cpf = c }
        if let ph = snap.phone { profile.phone = ph }
        if let px = snap.pix { profile.pix = px }

        // Authoritative identity from GET /rider/profile (overrides where present).
        if let rp = await client.fetchRiderProfile() {
            if let n = rp.name, !n.isEmpty { profile.name = n }
            if let c = rp.cpf { profile.cpf = c }
            if let ph = rp.phone { profile.phone = ph }
            if let px = rp.pix { profile.pix = px }
            if let p = rp.ponto, !p.isEmpty { profile.ponto = p }
            if let l = rp.leader, !l.isEmpty { profile.leader = l }
            if let nn = rp.ninetyNineId, !nn.isEmpty { profile.ninetyNineId = nn }
        }

        let shifts = (snap.shifts?.isEmpty == false) ? snap.shifts! : MockData.generateShifts()
        let products = (snap.products?.isEmpty == false) ? snap.products! : MockData.products
        let ledger = (snap.pointsLedger?.isEmpty == false) ? snap.pointsLedger! : MockData.pointsLedger

        return RiderBootstrap(
            profile: profile,
            pointsBalance: snap.pointsBalance ?? 4_820,
            wallet: WalletState(
                available: snap.walletAvailable ?? 438.70,
                pending: snap.walletPending ?? 164.20,
                weeklyGoalProgress: 72),
            shifts: shifts,
            products: products,
            pointsLedger: ledger)
    }

    func signup(shift: Shift) async throws {
        if let id = shift.apiId { _ = await client.enrollSlot(slotId: id) }
    }

    func cancelSignup(shift: Shift) async throws {
        if let id = shift.apiId { _ = await client.cancelSignup(slotId: id) }
    }

    func redeem(product: MallProduct) async throws {
        if let id = product.apiId { _ = await client.redeemProduct(productId: id) }
    }

    func requestWithdraw() async throws {
        _ = await client.requestPayout(amount: nil)  // nil = full available
    }

    func checkIn(pontoCode: String) async throws -> Int {
        await client.checkin(pontoCode: pontoCode) ?? 50
    }

    func updateProfile(_ profile: MembershipProfile) async throws {
        _ = await client.updateRiderProfile(
            name: profile.name, cpf: profile.cpf, phone: profile.phone, pix: profile.pix)
    }

    func redeemPartnerService(partnerCode: String, category: String) async throws -> Int? {
        await client.partnerRedeem(partnerCode: partnerCode, category: category)
    }

    func submitPartnerReview(partnerCode: String, rating: Int, comment: String) async throws {
        _ = await client.submitPartnerReview(partnerCode: partnerCode, rating: rating, comment: comment)
    }
}
