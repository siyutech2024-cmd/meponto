import SwiftUI

// 会员卡 / membership tier card — mirrors the hero card on the web rider home:
// tier level + stars + score + next-target + benefit + available balance,
// plus the rider's affiliation (网点 / 队长 / 片区 / 99 ID).
struct MembershipCard: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @Environment(\.colorScheme) private var scheme

    private func brl(_ v: Double) -> String {
        String(format: "R$ %.2f", v).replacingOccurrences(of: ".", with: ",")
    }

    var body: some View {
        let p = store.profile
        let tier = p.tier

        VStack(alignment: .leading, spacing: 14) {
            // Header: plan label + tier badge with stars
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(loc.t("member.title").uppercased())
                        .font(.caption2.weight(.bold))
                        .tracking(1.2)
                        .foregroundStyle(tier.accent)
                    Text(p.name)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text(tier.label)
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(.white)
                    HStack(spacing: 2) {
                        ForEach(0..<5, id: \.self) { i in
                            Image(systemName: i < tier.stars ? "star.fill" : "star")
                                .font(.system(size: 10))
                                .foregroundStyle(i < tier.stars ? tier.accent : Color.white.opacity(0.35))
                        }
                    }
                }
            }

            // Score + next target + available balance
            HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text("\(p.tierScore)")
                    .font(.system(size: 36, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                Text(tier.nextTarget)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(tier.accent)
                Spacer()
                VStack(alignment: .trailing, spacing: 1) {
                    Text(brl(store.wallet.available))
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.white)
                    Text(loc.t("wallet.available"))
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.6))
                }
            }

            // Benefit chip
            HStack(spacing: 6) {
                Image(systemName: "sparkles").font(.caption2)
                Text("\(loc.t("member.benefit")): \(tier.benefit)").font(.caption.weight(.semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(Color.white.opacity(0.14))
            .clipShape(Capsule())

            Divider().overlay(Color.white.opacity(0.18))

            // Identity rows: 网点 / 队长 / 片区 / 99 ID
            VStack(spacing: 8) {
                idRow(icon: "mappin.and.ellipse", label: loc.t("member.ponto"), value: p.ponto)
                idRow(icon: "person.2.fill", label: loc.t("member.leader"), value: p.leader)
                idRow(icon: "map.fill", label: loc.t("member.bairro"), value: p.bairro)
                idRow(icon: "number", label: loc.t("member.id99"), value: p.ninetyNineId)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: tier.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
    }

    private func idRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.8))
                .frame(width: 18)
            Text(label)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.6))
            Spacer()
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
        }
    }
}
