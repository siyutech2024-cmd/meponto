import SwiftUI

@main
struct MePontoRiderApp: App {
    @StateObject private var store = AppStore()
    @StateObject private var loc = LocalizationManager()
    @StateObject private var splash = SplashConfigStore()
    @StateObject private var auth = AuthManager()
    @AppStorage("appearance") private var appearance: String = "system" // system | dark | light

    var body: some Scene {
        WindowGroup {
            // Deferred login: everyone enters as a guest; member-only actions
            // present the auth sheet on demand.
            RootContainer()
                .environmentObject(store)
                .environmentObject(loc)
                .environmentObject(splash)
                .environmentObject(auth)
                .preferredColorScheme(resolvedScheme)
                .tint(Color(.sRGB, red: 1, green: 0.82, blue: 0))
                .task { auth.bootstrap() }
        }
    }

    private var resolvedScheme: ColorScheme? {
        switch appearance {
        case "dark": return .dark
        case "light": return .light
        default: return nil // follow system (MePonto defaults to dark on most devices)
        }
    }
}
