import SwiftUI

// MePonto rider membership tier — ported 1:1 from app/rider-app/page.tsx
// (getRiderTierScore + getRiderTierByScore). The score blends today's
// performance with the rider's consistency/incident history; thresholds
// map to 1★ → 2★ → 3★ → Gold → Diamond.

struct RiderTierInfo {
    let key: String      // base | green | orange | gold | diamond
    let label: String    // 1 estrela / 2 estrelas / 3 estrelas / Gold / Diamond
    let stars: Int
    let benefit: String
    let nextTarget: String

    // Tier gradient + accent for the membership card.
    var gradient: [Color] {
        switch key {
        case "diamond": return [Theme.color(0x07111f), Theme.color(0x123b53), Theme.color(0xbef0f7)]
        case "gold":    return [Theme.color(0x1d1202), Theme.color(0x9a5b08), Theme.color(0xffb238)]
        case "orange":  return [Theme.color(0x120b05), Theme.color(0x783900), Theme.color(0xff7a00)]
        case "green":   return [Theme.color(0x06150e), Theme.color(0x0f5130), Theme.color(0x20a65a)]
        default:        return [Theme.color(0x050505), Theme.color(0x161616)]
        }
    }

    var accent: Color {
        switch key {
        case "diamond": return Theme.color(0xa8f3ff)
        case "gold":    return Theme.color(0xffe2a3)
        case "orange":  return Theme.color(0xffb16a)
        case "green":   return Theme.color(0x91e8b4)
        default:        return Theme.color(0xff7a00)
        }
    }
}

enum RiderTier {

    // Today's performance inputs (mirrors `performanceToday` in the web app).
    static func score(ar: Int, nightShiftCount: Int, incidentCount: Int,
                      orders: Int = 18, tshHours: Double = 7.4,
                      acceptanceToday: Int = 96, caaOrders: Int = 5) -> Int {
        let orderScore = Double(min(orders, 24)) * 1.2
        let tshScore = min(tshHours, 10) * 2.2
        let arScore = Double(max(0, acceptanceToday - 70)) * 1.4
        let caaScore = Double(min(caaOrders, 8)) * 3
        let consistencyScore = Double(min(nightShiftCount, 18)) * 0.8
        let incidentPenalty = Double(incidentCount) * 8
        return Int((orderScore + tshScore + arScore + caaScore + consistencyScore - incidentPenalty + 12).rounded())
    }

    static func byScore(_ score: Int) -> RiderTierInfo {
        if score >= 108 {
            return RiderTierInfo(key: "diamond", label: "Diamond", stars: 5,
                                 benefit: "Max perks", nextTarget: "Topo Diamond")
        }
        if score >= 100 {
            return RiderTierInfo(key: "gold", label: "Gold", stars: 4,
                                 benefit: "Fila premium", nextTarget: "\(108 - score) pts → Diamond")
        }
        if score >= 86 {
            return RiderTierInfo(key: "orange", label: "3 ★", stars: 3,
                                 benefit: "Bônus pontos", nextTarget: "\(100 - score) pts → Gold")
        }
        if score >= 72 {
            return RiderTierInfo(key: "green", label: "2 ★", stars: 2,
                                 benefit: "Mais missões", nextTarget: "\(86 - score) pts → 3 ★")
        }
        return RiderTierInfo(key: "base", label: "1 ★", stars: 1,
                             benefit: "Base ativa", nextTarget: "\(max(0, 72 - score)) pts → 2 ★")
    }
}

// Rider membership / identity profile (会员资料), mirrors fields on the
// web Rider model: ponto (网点), leader (队长), bairro (片区), 99 ID.
struct MembershipProfile {
    var name: String
    var ponto: String
    var leader: String
    var bairro: String
    var ninetyNineId: String
    var ar: Int
    var nightShiftCount: Int
    var incidentCount: Int
    // Identity / payout details the rider can view and complete in the app.
    var cpf: String = ""
    var phone: String = ""
    var pix: String = ""

    var tierScore: Int { RiderTier.score(ar: ar, nightShiftCount: nightShiftCount, incidentCount: incidentCount) }
    var tier: RiderTierInfo { RiderTier.byScore(tierScore) }

    /// PIX + CPF + phone are required to receive payouts.
    var isComplete: Bool {
        !cpf.trimmingCharacters(in: .whitespaces).isEmpty &&
        !pix.trimmingCharacters(in: .whitespaces).isEmpty &&
        !phone.trimmingCharacters(in: .whitespaces).isEmpty
    }
}
