import SwiftUI

struct MallView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @EnvironmentObject var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var toast: String? = nil
    @State private var showMyQR = false
    @State private var showInvite = false

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        Screen(title: loc.t("mall.title")) {
            // Points balance
            Panel {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(loc.t("mall.balance")).font(.caption).foregroundStyle(Theme.muted(scheme))
                        Text("\(store.pointsBalance) pts")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundStyle(Theme.accent(scheme))
                    }
                    Spacer()
                    Image(systemName: "trophy.fill").font(.largeTitle).foregroundStyle(Theme.accent(scheme))
                }
            }

            // Quick actions: My QR (partner scans) + Invite friends
            HStack(spacing: 12) {
                QuickActionTile(icon: "qrcode", title: loc.t("points.myQR"),
                                detail: loc.t("points.myQRHint"), tone: .accent) { if auth.requireMember() { showMyQR = true } }
                QuickActionTile(icon: "person.2.badge.plus", title: loc.t("points.invite"),
                                detail: loc.t("points.inviteHint"), tone: .ok) { showInvite = true }
            }

            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(store.products) { product in
                    ProductCard(product: product) {
                        guard auth.requireMember() else { return }
                        if store.redeem(product) {
                            toast = "\(loc.t("mall.redeemed")): \(product.name)"
                        } else {
                            toast = loc.t("mall.insufficient")
                        }
                    }
                }
            }

            // 积分流水 / points statement
            Panel {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader(title: loc.t("points.statement"))
                    if store.pointsLedger.isEmpty {
                        StateView(icon: "tray", message: loc.t("empty.generic"))
                    }
                    ForEach(store.pointsLedger) { e in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.note).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text(scheme))
                                Text("\(e.source) · \(e.status)").font(.caption).foregroundStyle(Theme.muted(scheme))
                            }
                            Spacer()
                            Text("\(e.isEarn ? "+" : "")\(e.points) pts")
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(e.isEarn ? Theme.ok(scheme) : Theme.danger(scheme))
                        }
                        if e.id != store.pointsLedger.last?.id { Divider().background(Theme.line(scheme)) }
                    }
                }
            }
        }
        .sheet(isPresented: $showMyQR) {
            QRSheet(title: loc.t("points.myQR"), caption: loc.t("points.myQRHint"), value: store.myQRPayload)
        }
        .sheet(isPresented: $showInvite) {
            QRSheet(title: loc.t("points.invite"), caption: loc.t("points.inviteHint"), value: store.inviteQRPayload)
        }
        .overlay(alignment: .bottom) {
            if let toast {
                Text(toast)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Theme.surface(scheme))
                    .foregroundStyle(Theme.text(scheme))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line(scheme)))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                    .padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task {
                        try? await Task.sleep(nanoseconds: 1_800_000_000)
                        withAnimation { self.toast = nil }
                    }
            }
        }
        .animation(.easeInOut, value: toast)
    }
}

struct ProductCard: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @Environment(\.colorScheme) private var scheme
    let product: MallProduct
    let onRedeem: () -> Void

    private var affordable: Bool { store.pointsBalance >= product.points && product.stock > 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: product.systemIcon)
                .font(.title2)
                .foregroundStyle(Theme.accent(scheme))
            Text(product.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.text(scheme))
                .fixedSize(horizontal: false, vertical: true)
            Text(product.category).font(.caption2).foregroundStyle(Theme.muted(scheme))
            Spacer(minLength: 4)
            HStack {
                Text("\(product.points) pts").font(.caption.weight(.bold)).foregroundStyle(Theme.text(scheme))
                Spacer()
            }
            Button(action: onRedeem) {
                Text(product.stock == 0 ? "—" : loc.t("mall.redeem"))
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(affordable ? Theme.accent(scheme) : Theme.surfaceRaised(scheme))
                    .foregroundStyle(affordable ? Theme.accentInk(scheme) : Theme.muted(scheme))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSmall))
            }
            .disabled(!affordable)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 188, alignment: .topLeading)
        .background(Theme.surface(scheme))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line(scheme)))
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
    }
}
