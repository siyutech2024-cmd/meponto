import SwiftUI

struct HomeView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @EnvironmentObject var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var showScan = false
    @State private var showProfile = false
    @State private var showInvite = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background(scheme).ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        greeting
                        if auth.isMember {
                            // Personal data only after login.
                            MembershipCard()
                            todayStats
                            scanCard
                            inviteCard
                            performance
                            missions
                            cashLedger
                            partnerBenefits
                            inbox
                            tierPreview
                        } else {
                            // Guest: welcome + login CTA; public browsing via the tabs.
                            LoginPromptCard()
                            Text(loc.t("home.guestBrowse"))
                                .font(.subheadline)
                                .foregroundStyle(Theme.muted(scheme))
                                .padding(.horizontal, 4)
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("MePonto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 6) {
                        Image("MePontoLogo").resizable().scaledToFit().frame(width: 22, height: 22)
                        Text("MePonto").font(.headline).foregroundStyle(Theme.text(scheme))
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showProfile = true } label: {
                        Image(systemName: "person.crop.circle")
                    }
                    .accessibilityLabel(loc.t("profile.title"))
                }
            }
            .sheet(isPresented: $showScan) { ScanView() }
            .sheet(isPresented: $showProfile) { ProfileView() }
            .sheet(isPresented: $showInvite) {
                QRSheet(title: loc.t("points.invite"), caption: loc.t("points.inviteHint"), value: store.inviteQRPayload)
            }
        }
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(auth.isMember ? "\(loc.t("home.greeting")), \(store.riderName) 👋" : "\(loc.t("home.greeting")) 👋")
                .font(.title2.weight(.bold))
                .foregroundStyle(Theme.text(scheme))
            Text(auth.isMember ? (loc.t("home.rider") + " · " + store.profile.ponto) : loc.t("profile.guest"))
                .font(.subheadline)
                .foregroundStyle(Theme.muted(scheme))
        }
    }

    private var todayStats: some View {
        HStack(spacing: 12) {
            ForEach(store.todayStats) { s in
                StatTile(title: loc.t(s.titleKey), value: s.value, systemIcon: s.systemIcon, tone: s.tone)
            }
        }
    }

    private var scanCard: some View {
        Button { if auth.requireMember() { showScan = true } } label: {
            HStack(spacing: 12) {
                Image(systemName: "qrcode.viewfinder").font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(loc.t("home.scan")).fontWeight(.semibold)
                    Text("Ponto · Repasse · Parceiro").font(.caption).foregroundStyle(Theme.accentInk(scheme).opacity(0.7))
                }
                Spacer()
                Image(systemName: "chevron.right")
            }
            .foregroundStyle(Theme.accentInk(scheme))
            .padding(16)
            .background(Theme.accent(scheme))
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
        }
    }

    private var inviteCard: some View {
        Button { showInvite = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "person.2.badge.plus").font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(loc.t("points.invite")).fontWeight(.semibold)
                    Text(loc.t("points.inviteHint")).font(.caption)
                        .foregroundStyle(Theme.text(scheme).opacity(0.7))
                }
                Spacer()
                Image(systemName: "qrcode")
            }
            .foregroundStyle(Theme.text(scheme))
            .padding(16)
            .background(Theme.surface(scheme))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line(scheme)))
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
        }
        .buttonStyle(.plain)
    }

    private var performance: some View {
        Panel {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    SectionHeader(title: loc.t("home.performance"))
                    Text(loc.t("home.performanceWeek")).font(.caption2).foregroundStyle(Theme.muted(scheme))
                }
                HStack {
                    Metric(label: loc.t("home.orders"), value: "\(store.performance.orders)")
                    Divider().frame(height: 32)
                    Metric(label: loc.t("home.tsh"), value: String(format: "%.1f", store.performance.tshHours))
                    Divider().frame(height: 32)
                    Metric(label: loc.t("home.ar"), value: "\(store.performance.acceptanceRate)%")
                    Divider().frame(height: 32)
                    Metric(label: loc.t("home.caa"), value: "\(store.performance.cancelledOrders)")
                }
            }
        }
    }

    private var missions: some View {
        Panel {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    SectionHeader(title: loc.t("home.missions"))
                    Text(loc.t("home.missionsNote")).font(.caption2).foregroundStyle(Theme.muted(scheme))
                }
                ForEach(store.missions) { m in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(m.title).font(.subheadline).foregroundStyle(Theme.textSoft(scheme))
                            Spacer()
                            Badge(text: m.reward, tone: .accent)
                        }
                        ProgressBar(value: m.progress)
                    }
                }
            }
        }
    }

    private var cashLedger: some View {
        Panel {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: loc.t("home.cashLedger"))
                ForEach(store.cashLedger) { e in
                    LedgerRow(entry: e)
                    if e.id != store.cashLedger.last?.id { Divider().background(Theme.line(scheme)) }
                }
            }
        }
    }

    private var partnerBenefits: some View {
        Panel {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: loc.t("home.benefits"))
                ForEach(store.partnerBenefits) { b in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(b.partner).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text(scheme))
                            Text("\(b.service) · \(loc.t("map.discount")) \(b.discount)").font(.caption).foregroundStyle(Theme.muted(scheme))
                        }
                        Spacer()
                        Badge(text: b.status, tone: b.tone)
                    }
                }
            }
        }
    }

    private var inbox: some View {
        Panel {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: loc.t("home.inbox"))
                ForEach(store.inbox) { item in
                    HStack(alignment: .top, spacing: 10) {
                        Circle().fill(Theme.accent(scheme)).frame(width: 8, height: 8).padding(.top, 6)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text(scheme))
                            Text(item.detail).font(.caption).foregroundStyle(Theme.muted(scheme))
                        }
                        Spacer()
                        Text(item.time).font(.caption2).foregroundStyle(Theme.muted(scheme))
                    }
                }
            }
        }
    }

    private var tierPreview: some View {
        Panel {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: loc.t("home.tier"))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(store.tiers) { tier in
                            VStack(spacing: 6) {
                                Text("\(tier.score)").font(.title3.weight(.bold)).foregroundStyle(Theme.accent(scheme))
                                Text(tier.metric).font(.caption.weight(.semibold)).foregroundStyle(Theme.text(scheme))
                                Text(tier.threshold).font(.caption2).foregroundStyle(Theme.muted(scheme))
                            }
                            .frame(width: 92)
                            .padding(.vertical, 12)
                            .background(Theme.surfaceRaised(scheme))
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                        }
                    }
                }
            }
        }
    }
}

struct LedgerRow: View {
    @Environment(\.colorScheme) private var scheme
    let entry: LedgerEntry

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text(scheme))
                Text(entry.detail).font(.caption).foregroundStyle(Theme.muted(scheme))
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(entry.value)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(entry.value.hasPrefix("-") ? Theme.danger(scheme) : Theme.ok(scheme))
                Badge(text: entry.status, tone: entry.tone)
            }
        }
    }
}
