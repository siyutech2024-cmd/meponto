import Foundation

// Backend abstraction. Screens read from AppStore; AppStore talks to a RiderAPI.
// MockRiderAPI returns local data (guest / previews); LiveRiderAPI talks to the
// PontoSys rider endpoints and is injected once a member logs in — no UI changes.
struct RiderBootstrap {
    var profile: MembershipProfile
    var pointsBalance: Int
    var wallet: WalletState
    var shifts: [Shift]
    var products: [MallProduct]
    var pointsLedger: [PointsLedgerEntry]
}

enum APIError: Error { case unauthorized, network, server }

protocol RiderAPI {
    func fetchBootstrap() async throws -> RiderBootstrap
    func signup(shift: Shift) async throws
    func cancelSignup(shift: Shift) async throws
    func redeem(product: MallProduct) async throws
    func requestWithdraw() async throws
    func checkIn(pontoCode: String) async throws -> Int
    func updateProfile(_ profile: MembershipProfile) async throws
    func redeemPartnerService(partnerCode: String, category: String) async throws -> Int?
    func submitPartnerReview(partnerCode: String, rating: Int, comment: String) async throws
}

// In-memory implementation used for guest browsing, local builds and previews.
struct MockRiderAPI: RiderAPI {
    var latency: UInt64 = 350_000_000  // 0.35s to exercise loading states

    func fetchBootstrap() async throws -> RiderBootstrap {
        try? await Task.sleep(nanoseconds: latency)
        return RiderBootstrap(
            profile: MembershipProfile(
                name: "Lucas Ferreira", ponto: "Ponto Liberdade Sul", leader: "João Pereira",
                bairro: "Liberdade", ninetyNineId: "99-184273",
                ar: 96, nightShiftCount: 14, incidentCount: 1,
                // Phone arrives from the backend; CPF/PIX start empty so the rider
                // is prompted to complete them in the app.
                cpf: "", phone: "+55 11 98423-9911", pix: ""),
            pointsBalance: 4_820,
            wallet: WalletState(available: 438.70, pending: 164.20, weeklyGoalProgress: 72),
            shifts: MockData.generateShifts(),
            products: MockData.products,
            pointsLedger: MockData.pointsLedger)
    }

    func signup(shift: Shift) async throws { try? await Task.sleep(nanoseconds: latency) }
    func cancelSignup(shift: Shift) async throws { try? await Task.sleep(nanoseconds: latency) }
    func redeem(product: MallProduct) async throws { try? await Task.sleep(nanoseconds: latency) }
    func requestWithdraw() async throws { try? await Task.sleep(nanoseconds: latency) }
    func checkIn(pontoCode: String) async throws -> Int { try? await Task.sleep(nanoseconds: latency); return 50 }
    func updateProfile(_ profile: MembershipProfile) async throws { try? await Task.sleep(nanoseconds: latency) }
    func redeemPartnerService(partnerCode: String, category: String) async throws -> Int? { try? await Task.sleep(nanoseconds: latency); return nil }
    func submitPartnerReview(partnerCode: String, rating: Int, comment: String) async throws { try? await Task.sleep(nanoseconds: latency) }
}
