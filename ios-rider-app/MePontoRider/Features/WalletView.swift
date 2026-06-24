import SwiftUI

struct WalletView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @EnvironmentObject var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var showWithdrawAlert = false

    private func brl(_ v: Double) -> String {
        String(format: "R$ %.2f", v).replacingOccurrences(of: ".", with: ",")
    }

    var body: some View {
        Screen(title: loc.t("wallet.title")) {
            if !auth.isMember {
                LoginPromptCard(message: loc.t("auth.gatedAction"))
            } else {
                memberContent
            }
        }
        .alert(loc.t("wallet.withdraw"), isPresented: $showWithdrawAlert) {
            Button(loc.t("common.done"), role: .cancel) {}
        } message: {
            Text("PIX • \(loc.t("wallet.pending")): \(brl(store.wallet.pending))")
        }
    }

    @ViewBuilder
    private var memberContent: some View {
        Group {
            // Balance panel
            Panel {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(loc.t("wallet.available")).font(.caption).foregroundStyle(Theme.muted(scheme))
                        Text(brl(store.wallet.available))
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .foregroundStyle(Theme.text(scheme))
                    }
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(loc.t("wallet.pending")).font(.caption).foregroundStyle(Theme.muted(scheme))
                            Text(brl(store.wallet.pending)).font(.headline).foregroundStyle(Theme.warning(scheme))
                        }
                        Spacer()
                    }
                    if !store.profile.isComplete {
                        Text(loc.t("profile.completePrompt"))
                            .font(.caption).foregroundStyle(Theme.warning(scheme))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    PrimaryButton(title: loc.t("wallet.withdraw"), systemIcon: "arrow.down.circle.fill",
                                  enabled: store.wallet.available > 0 && store.profile.isComplete) {
                        store.requestWithdraw()
                        showWithdrawAlert = true
                    }
                }
            }

            // Weekly goal
            Panel {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text(loc.t("wallet.weeklyGoal")).font(.headline).foregroundStyle(Theme.text(scheme))
                        Spacer()
                        Text("\(store.wallet.weeklyGoalProgress)%").font(.headline).foregroundStyle(Theme.accent(scheme))
                    }
                    ProgressBar(value: Double(store.wallet.weeklyGoalProgress) / 100)
                }
            }

            // Statement
            Panel {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader(title: loc.t("wallet.statement"))
                    ForEach(store.cashLedger) { e in
                        LedgerRow(entry: e)
                        if e.id != store.cashLedger.last?.id { Divider().background(Theme.line(scheme)) }
                    }
                }
            }
        }
    }
}
