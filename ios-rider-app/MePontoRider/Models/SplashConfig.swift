import SwiftUI

// Launch / splash (开屏广告页) configuration.
//
// In production these values are pushed by the MePonto main backend (PontoSys
// console): the app fetches the JSON from `endpoint` on launch, caches it, and
// uses it next time. A bundled default is used until the first successful fetch.
// The Profile screen exposes a local preview editor so the page can be tested
// without the backend running.
struct SplashConfig: Codable, Equatable {
    var enabled: Bool
    var headline: String        // brand title, e.g. "MePonto"
    var tagline: String         // empty → use the localized default
    var durationMs: Int         // how long the splash stays on screen
    var backgroundHex: String   // "#07090d"
    var accentHex: String       // "#ffd100"
    var imageURL: String        // optional remote ad/banner image (empty → bundled logo)
    var linkURL: String         // optional tap-through for the ad

    static let `default` = SplashConfig(
        enabled: true,
        headline: "MePonto",
        tagline: "",
        durationMs: 2200,
        backgroundHex: "#07090d",
        accentHex: "#ffd100",
        imageURL: "",
        linkURL: ""
    )

    var backgroundColor: Color { Color(hex: backgroundHex) ?? Theme.color(0x07090d) }
    var accentColor: Color { Color(hex: accentHex) ?? Theme.color(0xffd100) }
    // Clamped so a bad backend/cached value can never freeze the launch on the
    // splash (always dismisses within 0.6s–3.0s).
    var duration: TimeInterval { Double(min(max(durationMs, 600), 3000)) / 1000.0 }
}

@MainActor
final class SplashConfigStore: ObservableObject {
    @AppStorage("splash_config_json") private var storedJSON: String = ""
    @Published var config: SplashConfig = .default

    // Backend endpoint that serves the splash JSON (managed from PontoSys).
    // Adjust to your environment; failures fall back to cache/default silently.
    let endpoint = URL(string: "https://mall.meponto.com/api/app/rider/splash")

    init() { loadCache() }

    private func loadCache() {
        guard let data = storedJSON.data(using: .utf8),
              let c = try? JSONDecoder().decode(SplashConfig.self, from: data) else { return }
        config = c
    }

    func update(_ c: SplashConfig) {
        config = c
        if let data = try? JSONEncoder().encode(c), let s = String(data: data, encoding: .utf8) {
            storedJSON = s
        }
    }

    func resetToDefault() { update(.default) }

    // Best-effort fetch of the backend-managed config.
    func refresh() async {
        guard let endpoint else { return }
        do {
            let (data, response) = try await URLSession.shared.data(from: endpoint)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }
            let c = try JSONDecoder().decode(SplashConfig.self, from: data)
            update(c)
        } catch {
            // Offline / not configured yet → keep cached or default.
        }
    }
}

extension Color {
    // Parse "#rrggbb" / "rrggbb".
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self = Theme.color(v)
    }
}
