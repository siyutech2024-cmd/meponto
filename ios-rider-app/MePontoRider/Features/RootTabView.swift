import SwiftUI

struct RootTabView: View {
    @EnvironmentObject var loc: LocalizationManager
    @Environment(\.colorScheme) private var scheme
    @State private var selection = 0

    var body: some View {
        TabView(selection: $selection) {
            HomeView()
                .tabItem { Label(loc.t("tab.home"), systemImage: "house.fill") }
                .tag(0)

            WalletView()
                .tabItem { Label(loc.t("tab.wallet"), systemImage: "wallet.pass.fill") }
                .tag(1)

            ShiftsView()
                .tabItem { Label(loc.t("tab.shifts"), systemImage: "calendar") }
                .tag(2)

            MallView()
                .tabItem { Label(loc.t("tab.mall"), systemImage: "bag.fill") }
                .tag(3)

            MapTabView()
                .tabItem { Label(loc.t("tab.map"), systemImage: "map.fill") }
                .tag(4)
        }
        .background(Theme.background(scheme).ignoresSafeArea())
    }
}

// Shared screen scaffold: branded background + scrollable content with a title.
struct Screen<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    var trailing: AnyView? = nil
    @ViewBuilder var content: Content

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background(scheme).ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        content
                    }
                    .padding(16)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                if let trailing {
                    ToolbarItem(placement: .topBarTrailing) { trailing }
                }
            }
        }
    }
}
