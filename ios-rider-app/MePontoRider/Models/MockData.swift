import Foundation
import SwiftUI

// App-wide observable store. Mock data mirrors app/rider-app (the web rider app):
// today's earnings/orders/points, performance, missions, cash ledger, partner
// benefits, shifts, points store and the partner map. Mutations (redeem, subscribe,
// withdraw) are kept in memory for local testing.
final class AppStore: ObservableObject {

    @Published var pointsBalance: Int = 4_820

    // 会员资料 / membership identity (网点 / 队长 / 片区 / 99 ID + 等级输入)
    @Published var profile = MembershipProfile(
        name: "Lucas Ferreira",
        ponto: "Ponto Liberdade Sul",
        leader: "João Pereira",
        bairro: "Liberdade",
        ninetyNineId: "99-184273",
        ar: 96, nightShiftCount: 14, incidentCount: 1
    )

    // Single source of truth for the rider's display name (first name).
    var riderName: String { profile.name.split(separator: " ").first.map(String.init) ?? profile.name }

    @Published var wallet = WalletState(available: 438.70, pending: 164.20, weeklyGoalProgress: 72)

    @Published var shifts: [Shift] = MockData.generateShifts()
    @Published var products: [MallProduct] = MockData.products

    // Backend abstraction + load lifecycle (idle → loading → loaded/failed).
    @Published private(set) var api: RiderAPI
    @Published var loadState: LoadState = .idle

    init(api: RiderAPI = MockRiderAPI()) {
        self.api = api
        // Seed sample reviews onto the partner ids.
        for (i, p) in partners.enumerated() where i < MockData.seedReviews.count {
            partnerReviews[p.id] = MockData.seedReviews[i]
        }
    }

    // MARK: - Partner service & reviews
    func reviews(for partner: Partner) -> [PartnerReview] { partnerReviews[partner.id] ?? [] }

    /// 折扣核销同时记录商户服务 → 商户获得积分（后端 best-effort）。
    func recordPartnerService(_ partner: Partner, code: String) {
        Task { try? await api.redeemPartnerService(partnerCode: code, category: partner.category) }
    }

    /// 骑手对服务点打分评论;本地乐观更新平均分与条数,并回写后端。
    func addReview(to partner: Partner, rating: Int, comment: String) {
        let review = PartnerReview(author: profile.name.isEmpty ? "Rider" : profile.name,
                                   rating: rating, comment: comment, dateText: "agora")
        partnerReviews[partner.id, default: []].insert(review, at: 0)
        if let i = partners.firstIndex(where: { $0.id == partner.id }) {
            let oldCount = partners[i].reviewCount
            let newCount = oldCount + 1
            partners[i].rating = ((partners[i].rating * Double(oldCount)) + Double(rating)) / Double(newCount)
            partners[i].reviewCount = newCount
        }
        Task { try? await api.submitPartnerReview(partnerCode: partner.name, rating: rating, comment: comment) }
    }

    /// Swap the backend (e.g. guest MockRiderAPI → member LiveRiderAPI after login).
    func configure(api: RiderAPI) { self.api = api }

    @MainActor
    func load() async {
        loadState = .loading
        do {
            let b = try await api.fetchBootstrap()
            profile = b.profile
            pointsBalance = b.pointsBalance
            wallet = b.wallet
            shifts = b.shifts
            products = b.products
            pointsLedger = b.pointsLedger
            loadState = .loaded
        } catch {
            loadState = .failed
        }
    }

    let todayStats = MockData.todayStats
    let performance = MockData.performance
    let missions = MockData.missions
    let inbox = MockData.inbox
    let cashLedger = MockData.cashLedger
    let partnerBenefits = MockData.partnerBenefits
    let tiers = MockData.tiers
    @Published var partners = MockData.partners
    @Published var partnerReviews: [UUID: [PartnerReview]] = [:]
    let helpActions = MockData.helpActions
    @Published var pointsLedger = MockData.pointsLedger

    // Stable per-rider payloads encoded in the QR codes.
    var myQRPayload: String { "meponto://rider/\(profile.ninetyNineId)" }
    var inviteQRPayload: String { "meponto://invite/\(profile.ninetyNineId)" }

    // Each rider is bound to a Ponto: they only see / can sign up for shifts at
    // their own station. All schedule queries below are scoped to profile.ponto.
    var riderShifts: [Shift] {
        shifts.filter { $0.zone == profile.ponto }
    }

    private static let dateParser: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static var isoCalendar: Calendar = {
        var c = Calendar(identifier: .iso8601) // Monday-first weeks
        return c
    }()

    static func weekKey(of dateKey: String) -> String {
        guard let d = dateParser.date(from: dateKey) else { return dateKey }
        let c = isoCalendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: d)
        return String(format: "%04d-W%02d", c.yearForWeekOfYear ?? 0, c.weekOfYear ?? 0)
    }

    private func daysFor(_ keys: [String]) -> [ScheduleDay] {
        keys.sorted().map { key in
            let day = riderShifts.filter { $0.dateKey == key }
            return ScheduleDay(
                id: key,
                weekday: day.first?.weekday ?? "",
                dayLabel: day.first?.dayLabel ?? "",
                shiftIDs: day.map(\.id),
                subscribedCount: day.filter(\.subscribed).count
            )
        }
    }

    // Rider's shifts grouped into weeks (this week, next week, …), each week a
    // list of its days. Sorted chronologically.
    var riderWeeks: [[ScheduleDay]] {
        var groups: [String: [String]] = [:]
        for key in Set(riderShifts.map(\.dateKey)) {
            groups[AppStore.weekKey(of: key), default: []].append(key)
        }
        return groups.keys.sorted().map { daysFor(groups[$0]!) }
    }

    func shifts(on dateKey: String) -> [Shift] {
        riderShifts.filter { $0.dateKey == dateKey }
    }

    // Agenda = the rider's own subscribed shifts (already ponto-scoped).
    var subscribedShifts: [Shift] {
        riderShifts.filter(\.subscribed).sorted { $0.dateKey < $1.dateKey }
    }

    // MARK: - Mutations
    func toggleSubscription(_ shift: Shift) {
        guard let i = shifts.firstIndex(where: { $0.id == shift.id }) else { return }
        if shifts[i].subscribed {
            shifts[i].status = .none
            shifts[i].takenSpots = max(shifts[i].takenSpots - 1, 0)
            let s = shifts[i]
            Task { try? await api.cancelSignup(shift: s) }
        } else if shifts[i].openSpots > 0 {
            // New signups enter the approval queue (Em análise), matching the
            // web dispatch flow where the station/franchise reviews them.
            shifts[i].status = .submitted
            shifts[i].takenSpots += 1
            let s = shifts[i]
            Task { try? await api.signup(shift: s) }
        }
    }

    @discardableResult
    func redeem(_ product: MallProduct) -> Bool {
        guard pointsBalance >= product.points,
              let i = products.firstIndex(where: { $0.id == product.id }),
              products[i].stock > 0 else { return false }
        pointsBalance -= product.points
        products[i].stock -= 1
        let redeemed = product
        Task { try? await api.redeem(product: redeemed) }
        return true
    }

    // 站点签到 / station check-in awards points to the rider.
    let checkInReward = 50
    @discardableResult
    func checkIn(pontoCode: String) -> Int {
        pointsBalance += checkInReward
        let code = pontoCode
        Task { _ = try? await api.checkIn(pontoCode: code) }
        return checkInReward
    }

    func requestWithdraw() {
        let amount = wallet.available
        guard amount > 0 else { return }
        wallet.pending += amount
        wallet.available = 0
        Task { try? await api.requestWithdraw() }
    }

    // Rider updates their own identity / payout details (name / CPF / phone / PIX).
    func updateProfile(name: String, cpf: String, phone: String, pix: String) {
        profile.name = name
        profile.cpf = cpf
        profile.phone = phone
        profile.pix = pix
        let snapshot = profile
        Task { try? await api.updateProfile(snapshot) }
    }
}

enum MockData {
    // Earnings settle on the previous business date (99 import rule), so the
    // headline figure is YESTERDAY's earnings, not today's.
    static let todayStats: [StatCard] = [
        StatCard(titleKey: "home.earnings", value: "R$ 86,40", systemIcon: "brazilianrealsign.circle.fill", tone: .accent),
        StatCard(titleKey: "home.orders", value: "18", systemIcon: "bicycle", tone: .neutral),
        StatCard(titleKey: "home.points", value: "+240", systemIcon: "trophy.fill", tone: .ok),
    ]

    // Performance is a WEEKLY, per-rider rollup (same definition as the backend).
    static let performance = Performance(orders: 112, tshHours: 41.5, acceptanceRate: 95, cancelledOrders: 7)

    static let missions: [Mission] = [
        Mission(title: "Completar 24 entregas", reward: "+320 pts", progress: 0.75),
        Mission(title: "Noite segura no Ponto", reward: "R$ 45", progress: 0.58),
        Mission(title: "5 dias consecutivos online", reward: "+150 pts", progress: 0.40),
    ]

    static let inbox: [InboxItem] = [
        InboxItem(title: "Saldo atualizado", detail: "R$ 120,00 liberados no seu extrato.", time: "Agora"),
        InboxItem(title: "Oferta de combustível", detail: "Benefício ativo para membros MePonto.", time: "12 min"),
        InboxItem(title: "Novo turno noturno", detail: "Vagas abertas no Ponto Liberdade Sul.", time: "1 h"),
    ]

    static let cashLedger: [LedgerEntry] = [
        LedgerEntry(title: "Repasse liberado", detail: "Corridas confirmadas no Ponto Liberdade Sul", value: "+R$ 120,00", status: "Disponível", tone: .ok),
        LedgerEntry(title: "Saque solicitado", detail: "PIX final 1842, previsão hoje 18:00", value: "-R$ 86,40", status: "Processando", tone: .warning),
        LedgerEntry(title: "Bônus noturno", detail: "Missão de cobertura aprovada", value: "+R$ 45,00", status: "Pago", tone: .ok),
    ]

    static let partnerBenefits: [PartnerBenefit] = [
        PartnerBenefit(partner: "Oficina Liberdade", service: "Manutenção", discount: "R$ 20", status: "Partner +100 pts", tone: .ok),
        PartnerBenefit(partner: "Posto Avenida", service: "Combustível", discount: "R$ 5", status: "Em análise", tone: .warning),
    ]

    static let tiers: [Tier] = [
        Tier(score: 64, metric: "Base", detail: "Primeiros ganhos", threshold: "0–71"),
        Tier(score: 78, metric: "Consistente", detail: "Boa presença", threshold: "72–85"),
        Tier(score: 92, metric: "Forte", detail: "Alta performance", threshold: "86–99"),
        Tier(score: 102, metric: "Elite", detail: "Prioridade local", threshold: "100–107"),
        Tier(score: 112, metric: "Top", detail: "Brilho máximo", threshold: "108+"),
    ]

    // A shift slot template (no calendar date — dates are generated relative to
    // "today" so the schedule is always current instead of frozen in time).
    private struct Slot {
        let weekdayIndex: Int   // 1 = Mon … 7 = Sun (ISO)
        let window: String
        let hotzone: String
        let total: Int
        let taken: Int
        var critical: Bool = false
        var statusThisWeek: ShiftSignupStatus = .none
    }

    private static let pontoName = "Ponto Liberdade Sul"
    private static let stationName = "Liberdade"

    private static let slots: [Slot] = [
        Slot(weekdayIndex: 1, window: "11:00 – 15:00", hotzone: "Centro", total: 10, taken: 6),
        Slot(weekdayIndex: 1, window: "18:00 – 22:00", hotzone: "Av. Liberdade", total: 12, taken: 9, statusThisWeek: .approved),
        Slot(weekdayIndex: 2, window: "18:00 – 22:00", hotzone: "Av. Liberdade", total: 12, taken: 5),
        Slot(weekdayIndex: 3, window: "08:00 – 12:00", hotzone: "Estação Sé", total: 12, taken: 3),
        Slot(weekdayIndex: 3, window: "19:00 – 23:00", hotzone: "Centro", total: 8, taken: 3, critical: true, statusThisWeek: .submitted),
        Slot(weekdayIndex: 4, window: "06:00 – 10:00", hotzone: "Mercado", total: 10, taken: 4),
        Slot(weekdayIndex: 4, window: "08:00 – 12:00", hotzone: "Estação Sé", total: 12, taken: 6),
        Slot(weekdayIndex: 4, window: "11:00 – 15:00", hotzone: "Centro", total: 10, taken: 3),
        Slot(weekdayIndex: 4, window: "14:00 – 18:00", hotzone: "Paulista", total: 10, taken: 2),
        Slot(weekdayIndex: 4, window: "19:00 – 23:00", hotzone: "Av. Liberdade", total: 8, taken: 1, critical: true),
        Slot(weekdayIndex: 5, window: "17:00 – 21:00", hotzone: "Paulista", total: 10, taken: 2),
        Slot(weekdayIndex: 5, window: "21:00 – 01:00", hotzone: "Centro", total: 6, taken: 1, critical: true),
        Slot(weekdayIndex: 6, window: "11:00 – 16:00", hotzone: "Mercado", total: 14, taken: 8),
    ]

    private static let ptWeekday = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]

    // Build two weeks of shifts (this week + next) anchored to `now`.
    static func generateShifts(now: Date = Date()) -> [Shift] {
        var cal = Calendar(identifier: .iso8601)
        cal.firstWeekday = 2
        let comps = cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: now)
        guard let weekStart = cal.date(from: comps) else { return [] }

        let keyFmt = DateFormatter(); keyFmt.locale = Locale(identifier: "en_US_POSIX"); keyFmt.dateFormat = "yyyy-MM-dd"
        let labelFmt = DateFormatter(); labelFmt.locale = Locale(identifier: "en_US_POSIX"); labelFmt.dateFormat = "dd/MM"

        var out: [Shift] = []
        for weekOffset in 0...1 {
            for slot in slots {
                guard let date = cal.date(byAdding: .day, value: (slot.weekdayIndex - 1) + weekOffset * 7, to: weekStart) else { continue }
                out.append(Shift(
                    zone: pontoName, station: stationName,
                    dateKey: keyFmt.string(from: date),
                    weekday: ptWeekday[slot.weekdayIndex - 1],
                    dayLabel: labelFmt.string(from: date),
                    window: slot.window, hotzone: slot.hotzone,
                    totalSpots: slot.total, takenSpots: slot.taken,
                    critical: slot.critical,
                    status: weekOffset == 0 ? slot.statusThisWeek : .none
                ))
            }
        }
        return out
    }

    static let products: [MallProduct] = [
        MallProduct(name: "Vale combustível R$ 20", category: "Combustível", points: 1_200, systemIcon: "fuelpump.fill", stock: 30),
        MallProduct(name: "Manutenção da moto", category: "Veículo", points: 2_400, systemIcon: "wrench.and.screwdriver.fill", stock: 12),
        MallProduct(name: "Capacete certificado", category: "Segurança", points: 5_600, systemIcon: "shield.lefthalf.filled", stock: 8),
        MallProduct(name: "Capa de chuva Pro", category: "Equipamento", points: 1_800, systemIcon: "cloud.rain.fill", stock: 20),
        MallProduct(name: "Bag térmica 45L", category: "Equipamento", points: 3_200, systemIcon: "bag.fill", stock: 15),
        MallProduct(name: "Recarga celular R$ 15", category: "Conectividade", points: 900, systemIcon: "antenna.radiowaves.left.and.right", stock: 50),
    ]

    // Coordinates around São Paulo (Liberdade / Centro).
    static let partners: [Partner] = [
        Partner(name: "Oficina Liberdade", neighborhood: "Liberdade", category: "Manutenção", services: "Revisão / Pneus", discountBRL: 20, partnerPoints: 100, distance: "1.8 km", latitude: -23.5587, longitude: -46.6350, rating: 4.6, reviewCount: 28),
        Partner(name: "Posto Avenida", neighborhood: "Sé", category: "Combustível", services: "Gasolina / Etanol", discountBRL: 5, partnerPoints: 60, distance: "0.9 km", latitude: -23.5505, longitude: -46.6333, rating: 4.2, reviewCount: 41),
        Partner(name: "MotoPeças Centro", neighborhood: "República", category: "Veículo", services: "Peças / Acessórios", discountBRL: 15, partnerPoints: 80, distance: "6.4 km", latitude: -23.5430, longitude: -46.6420, rating: 4.8, reviewCount: 15),
        Partner(name: "Lava Rápido Norte", neighborhood: "Santana", category: "Manutenção", services: "Lavagem / Higienização", discountBRL: 8, partnerPoints: 40, distance: "8.1 km", latitude: -23.5050, longitude: -46.6280, rating: 3.9, reviewCount: 9),
    ]

    // Seed reviews keyed by partner index (mapped to ids in AppStore).
    static let seedReviews: [[PartnerReview]] = [
        [PartnerReview(author: "Carlos M.", rating: 5, comment: "Atendimento rápido e preço justo.", dateText: "2d"),
         PartnerReview(author: "Ana P.", rating: 4, comment: "Boa revisão, recomendo.", dateText: "1sem")],
        [PartnerReview(author: "João S.", rating: 4, comment: "Combustível com desconto certinho.", dateText: "3d")],
        [PartnerReview(author: "Diego A.", rating: 5, comment: "Peças originais e entrega na hora.", dateText: "5d")],
        [PartnerReview(author: "Marcos L.", rating: 4, comment: "Lavagem caprichada.", dateText: "1d")],
    ]

    static let pointsLedger: [PointsLedgerEntry] = [
        PointsLedgerEntry(note: "Entregas confirmadas", source: "99Food", points: 240, status: "Confirmado"),
        PointsLedgerEntry(note: "Resgate vale combustível", source: "PontoMall", points: -1_200, status: "Concluído"),
        PointsLedgerEntry(note: "Benefício parceiro — manutenção", source: "Oficina Liberdade", points: 100, status: "Confirmado"),
        PointsLedgerEntry(note: "Missão noite segura", source: "Missão", points: 320, status: "Confirmado"),
        PointsLedgerEntry(note: "Indicação de amigo", source: "Convite", points: 150, status: "Confirmado"),
    ]

    static let helpActions: [HelpAction] = [
        HelpAction(titleKey: "support.safety", detail: "Abrir chamado urgente no Ponto", systemIcon: "shield.fill", tone: .danger),
        HelpAction(titleKey: "support.chat", detail: "Atendimento pelo chat do app", systemIcon: "message.fill", tone: .accent),
        HelpAction(titleKey: "support.account", detail: "PIN, aparelho e dados sensíveis", systemIcon: "lock.fill", tone: .neutral),
    ]
}
