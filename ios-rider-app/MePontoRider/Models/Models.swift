import Foundation
import CoreLocation

// Async load lifecycle for screens backed by the API.
enum LoadState: Equatable { case idle, loading, loaded, failed }

struct StatCard: Identifiable {
    let id = UUID()
    let titleKey: String
    let value: String
    let systemIcon: String
    let tone: Tone
}

struct Performance {
    let orders: Int
    let tshHours: Double
    let acceptanceRate: Int
    let cancelledOrders: Int
}

struct Mission: Identifiable {
    let id = UUID()
    let title: String
    let reward: String
    let progress: Double // 0...1
}

struct InboxItem: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let time: String
}

struct LedgerEntry: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let value: String
    let status: String
    let tone: Tone
}

struct PartnerBenefit: Identifiable {
    let id = UUID()
    let partner: String
    let service: String
    let discount: String
    let status: String
    let tone: Tone
}

struct Tier: Identifiable {
    let id = UUID()
    let score: Int
    let metric: String
    let detail: String
    let threshold: String
}

enum ShiftSignupStatus {
    case none, submitted, approved, rejected

    var key: String {
        switch self {
        case .none: return "shift.status.none"
        case .submitted: return "shift.status.submitted"
        case .approved: return "shift.status.approved"
        case .rejected: return "shifts.spots" // unused fallback
        }
    }

    var tone: Tone {
        switch self {
        case .none: return .neutral
        case .submitted: return .warning
        case .approved: return .ok
        case .rejected: return .danger
        }
    }
}

struct Shift: Identifiable {
    let id = UUID()
    let zone: String
    let station: String
    let dateKey: String    // "2026-06-23" — used to group/sort by day
    let weekday: String    // "Seg"
    let dayLabel: String   // "23/06"
    let window: String
    let hotzone: String    // demand area for the slot (no guaranteed pay)
    let totalSpots: Int
    var takenSpots: Int
    var critical: Bool = false  // high-demand slot flagged by ops
    var status: ShiftSignupStatus = .none
    var apiId: String? = nil    // PontoSys slot id (nil for local mock shifts)
    var subscribed: Bool { status == .submitted || status == .approved }
    var openSpots: Int { max(totalSpots - takenSpots, 0) }
}

// One day column in the weekly schedule grid.
struct ScheduleDay: Identifiable {
    let id: String          // dateKey
    let weekday: String
    let dayLabel: String
    let shiftIDs: [UUID]
    let subscribedCount: Int
}

struct MallProduct: Identifiable {
    let id = UUID()
    let name: String
    let category: String
    let points: Int
    let systemIcon: String
    var stock: Int
    var apiId: String? = nil   // backend catalog id (used for redeem)
}

struct Partner: Identifiable {
    let id = UUID()
    let name: String
    let neighborhood: String
    let category: String
    let services: String
    let discountBRL: Int
    let partnerPoints: Int
    let distance: String
    let latitude: Double
    let longitude: Double
    var rating: Double = 0      // average 0–5
    var reviewCount: Int = 0
    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

// 骑手对商户服务点的评价 / a rider's review of a partner service point.
struct PartnerReview: Identifiable {
    let id = UUID()
    let author: String
    let rating: Int      // 1–5
    let comment: String
    let dateText: String
}

struct PointsLedgerEntry: Identifiable {
    let id = UUID()
    let note: String
    let source: String
    let points: Int      // signed: + earn / - spend
    let status: String
    var isEarn: Bool { points >= 0 }
}

struct HelpAction: Identifiable {
    let id = UUID()
    let titleKey: String
    let detail: String
    let systemIcon: String
    let tone: Tone
}

struct WalletState {
    var available: Double
    var pending: Double
    var weeklyGoalProgress: Int // percent
}
