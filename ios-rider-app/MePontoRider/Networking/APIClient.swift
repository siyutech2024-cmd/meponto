import Foundation

// PontoSys API client (mirrors the Android RiderRepository). URLSession shares
// HTTPCookieStorage, so the member-login session cookie (meponto_session) is
// captured and resent automatically. Every read is best-effort: a failure
// (offline / 4xx / shape change) returns nil and the AppStore keeps its mock.
enum API {
    // Backend base URL. Override per scheme/config if needed.
    static let baseURL = URL(string: "https://mall.meponto.com/api/")!
}

// MARK: - Envelope + DTOs

struct Envelope<T: Decodable>: Decodable {
    let data: T?
    let error: String?
}

struct MemberLoginData: Decodable {
    let name: String?
    let role: String?
    let portal: String?
}

// GET /rider/profile
struct RiderProfileDto: Decodable {
    let riderId: String?
    let name: String?
    let cpf: String?
    let phone: String?
    let pix: String?
    let ponto: String?
    let leader: String?
    let ninetyNineId: String?
}

// POST /rider/checkin
struct CheckinDto: Decodable { let points: Int?; let checkinId: String? }
// Generic write ack
struct AckDto: Decodable { let id: String?; let status: String? }

struct WalletData: Decodable { let me: WalletMe? }
struct WalletMe: Decodable {
    let riderId: String?
    let name: String?
    let available: Double?
    let held: Double?
    let paid: Double?
    let settled: Double?
    // Identity / payout fields (present when the backend exposes them).
    let cpf: String?
    let pix: String?
    let phone: String?
}

struct PointsData: Decodable {
    let accounts: [PointsAccountDto]?
    let ledger: [PointsLedgerDto]?
}
struct PointsAccountDto: Decodable {
    let riderId: String?
    let available: Int?
    let pending: Int?
}
struct PointsLedgerDto: Decodable {
    let type: String?
    let points: Int?
    let status: String?
    let sourceType: String?
    let note: String?
    let reasonCode: String?
}

struct CatalogProductDto: Decodable {
    let id: String?
    let name: String?
    let pointsPrice: Int?
    let stock: Int?
    let category: String?
    let status: String?
}

struct SlotsData: Decodable {
    let slots: [RiderSlotDto]?
    let enrollments: [SlotEnrollmentDto]?
    let weekStatus: String?
}
struct RiderSlotDto: Decodable {
    let id: String?
    let date: String?
    let weekday: String?
    let startTime: String?
    let endTime: String?
    let capacity: Int?
    let enrolled: Int?
    let status: String?
    let priority: Bool?
    let pontoName: String?
    let franchiseName: String?
    let quotaNote: String?
}
struct SlotEnrollmentDto: Decodable {
    let id: String?
    let slotId: String?
    let status: String?
}

// Aggregated snapshot applied to the AppStore (nil fields keep mock values).
struct RiderSnapshot {
    var riderName: String?
    var ponto: String?
    var cpf: String?
    var phone: String?
    var pix: String?
    var walletAvailable: Double?
    var walletPending: Double?
    var pointsBalance: Int?
    var pointsLedger: [PointsLedgerEntry]?
    var products: [MallProduct]?
    var shifts: [Shift]?
}

// MARK: - Client

struct APIClient {

    // MARK: HTTP helpers
    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async -> T? {
        guard var comp = URLComponents(url: API.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else { return nil }
        if !query.isEmpty { comp.queryItems = query }
        guard let url = comp.url else { return nil }
        do {
            var req = URLRequest(url: url)
            req.timeoutInterval = 20
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else { return nil }
            return try JSONDecoder().decode(Envelope<T>.self, from: data).data
        } catch {
            return nil
        }
    }

    private func post<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> Envelope<T> {
        let url = API.baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 20
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(Envelope<T>.self, from: data)
    }

    // Best-effort write: returns decoded data on 2xx, nil otherwise. Sends an
    // Idempotency-Key so retries don't double-apply (see backend PRD).
    private func write<B: Encodable, T: Decodable>(_ path: String, method: String = "POST", body: B?) async -> T? {
        guard let url = URLComponents(url: API.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)?.url else { return nil }
        do {
            var req = URLRequest(url: url)
            req.httpMethod = method
            req.timeoutInterval = 20
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue(UUID().uuidString, forHTTPHeaderField: "Idempotency-Key")
            if let body { req.httpBody = try JSONEncoder().encode(body) }
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return nil }
            return try JSONDecoder().decode(Envelope<T>.self, from: data).data
        } catch {
            return nil
        }
    }

    // MARK: Endpoints
    /// member-login by phone → member display name on success.
    func login(phone: String) async -> Result<String, Error> {
        do {
            let env: Envelope<MemberLoginData> = try await post("member-login", body: ["phone": phone])
            if let name = env.data?.name { return .success(name) }
            return .failure(NSError(domain: "meponto", code: 1, userInfo: [NSLocalizedDescriptionKey: env.error ?? "Login falhou"]))
        } catch {
            return .failure(error)
        }
    }

    /// Submit a slot application (rider must be tier-2+ and the week open).
    func enrollSlot(slotId: String) async -> Bool {
        do {
            let env: Envelope<SlotEnrollmentDto> = try await post("slots", body: ["slotId": slotId])
            return env.data != nil
        } catch {
            return false
        }
    }

    /// Pulls wallet → points → catalog → slots for the logged-in rider.
    func loadSnapshot(riderName: String) async -> RiderSnapshot {
        let wallet: WalletData? = await get("wallet", query: [URLQueryItem(name: "riderName", value: riderName)])
        let me = wallet?.me
        let riderId = me?.riderId

        var pointsBalance: Int?
        var ledger: [PointsLedgerEntry]?
        if let id = riderId {
            let points: PointsData? = await get("points", query: [URLQueryItem(name: "riderId", value: id)])
            let account = points?.accounts?.first(where: { $0.riderId == id }) ?? points?.accounts?.first
            pointsBalance = account?.available
            ledger = points?.ledger?.compactMap(Self.mapLedger)
        }

        let catalog: [CatalogProductDto]? = await get("marketplace/catalog")
        let products = catalog?
            .filter { $0.status == nil || $0.status == "active" }
            .compactMap(Self.mapProduct)

        let slotsData: SlotsData? = await get("slots")
        let enrollBySlot = Dictionary(grouping: slotsData?.enrollments ?? [], by: { $0.slotId ?? "" })
        let shifts = slotsData?.slots?.compactMap { Self.mapShift($0, enrolls: enrollBySlot[$0.id ?? ""]) }
        let ponto = slotsData?.slots?.first?.pontoName

        return RiderSnapshot(
            riderName: me?.name,
            ponto: ponto,
            cpf: me?.cpf,
            phone: me?.phone,
            pix: me?.pix,
            walletAvailable: me?.available,
            walletPending: me?.held,
            pointsBalance: pointsBalance,
            pointsLedger: ledger,
            products: products,
            shifts: shifts
        )
    }

    /// GET /rider/profile — full identity for the logged-in rider.
    func fetchRiderProfile() async -> RiderProfileDto? {
        await get("rider/profile")
    }

    /// Update the rider's own identity / payout details.
    func updateRiderProfile(name: String, cpf: String, phone: String, pix: String) async -> Bool {
        let ack: AckDto? = await write("rider/profile", body: ["name": name, "cpf": cpf, "phone": phone, "pix": pix])
        return ack != nil
    }

    /// POST /rider/payout — request a payout (full available when amount is nil).
    func requestPayout(amount: Double?) async -> Bool {
        let ack: AckDto? = await write("rider/payout", body: ["amount": amount])
        return ack != nil
    }

    /// POST /marketplace/redeem — redeem a catalog product with points.
    func redeemProduct(productId: String, qty: Int = 1) async -> Bool {
        struct Body: Encodable { let productId: String; let qty: Int }
        let ack: AckDto? = await write("marketplace/redeem", body: Body(productId: productId, qty: qty))
        return ack != nil
    }

    /// POST /slots/cancel — cancel an existing signup, releasing the spot.
    func cancelSignup(slotId: String) async -> Bool {
        let ack: AckDto? = await write("slots/cancel", body: ["slotId": slotId])
        return ack != nil
    }

    /// POST /rider/checkin — station check-in; returns awarded points.
    func checkin(pontoCode: String, lat: Double? = nil, lng: Double? = nil) async -> Int? {
        struct Body: Encodable { let pontoCode: String; let lat: Double?; let lng: Double? }
        let dto: CheckinDto? = await write("rider/checkin", body: Body(pontoCode: pontoCode, lat: lat, lng: lng))
        return dto?.points
    }

    /// POST /partner/redeem — record a partner service; partner earns points.
    struct PartnerRedeemDto: Decodable { let redeemId: String?; let partnerPoints: Int? }
    func partnerRedeem(partnerCode: String, category: String) async -> Int? {
        struct Body: Encodable { let partnerCode: String; let category: String }
        let dto: PartnerRedeemDto? = await write("partner/redeem", body: Body(partnerCode: partnerCode, category: category))
        return dto?.partnerPoints
    }

    /// POST /partner/review — rider rates / comments a partner service point.
    func submitPartnerReview(partnerCode: String, rating: Int, comment: String) async -> Bool {
        struct Body: Encodable { let partnerCode: String; let rating: Int; let comment: String }
        let ack: AckDto? = await write("partner/review", body: Body(partnerCode: partnerCode, rating: rating, comment: comment))
        return ack != nil
    }

    // MARK: Mappers
    private static let earnTypes: Set<String> = ["earn", "refund", "release", "adjust"]
    private static let approvedStatuses: Set<String> = ["hq_reviewed", "franchise_confirmed"]
    private static let inactiveStatuses: Set<String> = ["rejected", "cancelled"]

    private static func mapLedger(_ d: PointsLedgerDto) -> PointsLedgerEntry? {
        guard let mag = d.points else { return nil }
        let signed = earnTypes.contains(d.type ?? "") ? abs(mag) : -abs(mag)
        return PointsLedgerEntry(
            note: d.note ?? d.reasonCode ?? (d.type ?? "—"),
            source: d.sourceType ?? "",
            points: signed,
            status: d.status ?? ""
        )
    }

    private static func mapProduct(_ d: CatalogProductDto) -> MallProduct? {
        guard let name = d.name else { return nil }
        return MallProduct(name: name, category: d.category ?? "", points: d.pointsPrice ?? 0,
                           systemIcon: "bag.fill", stock: d.stock ?? 0, apiId: d.id)
    }

    private static let dateIn: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f
    }()
    private static let dateOut: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "dd/MM"; return f
    }()

    private static func mapShift(_ d: RiderSlotDto, enrolls: [SlotEnrollmentDto]?) -> Shift? {
        guard let date = d.date else { return nil }
        let active = enrolls?.first(where: { !inactiveStatuses.contains($0.status ?? "") })
        let status: ShiftSignupStatus
        switch active?.status {
        case .none: status = .none
        case let s? where approvedStatuses.contains(s): status = .approved
        default: status = .submitted
        }
        let dayLabel = dateIn.date(from: date).map { dateOut.string(from: $0) } ?? date
        return Shift(
            zone: d.pontoName ?? "",
            station: d.franchiseName ?? "",
            dateKey: date,
            weekday: d.weekday ?? "",
            dayLabel: dayLabel,
            window: "\(d.startTime ?? "") – \(d.endTime ?? "")",
            hotzone: d.quotaNote ?? (d.pontoName ?? ""),
            totalSpots: d.capacity ?? 0,
            takenSpots: d.enrolled ?? 0,
            critical: d.priority ?? false,
            status: status,
            apiId: d.id
        )
    }
}
