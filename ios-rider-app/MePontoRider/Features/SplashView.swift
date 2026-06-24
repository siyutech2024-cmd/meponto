import SwiftUI

// Launch / splash screen. Brand + animation, driven by SplashConfig (which the
// MePonto backend can push). Uses the real MePonto logo asset; an optional
// remote ad image (config.imageURL) is shown above the logo when provided.
struct SplashView: View {
    @EnvironmentObject var loc: LocalizationManager
    let config: SplashConfig

    @State private var logoIn = false
    @State private var textIn = false
    @State private var ringScale: CGFloat = 0.7

    private var tagline: String {
        config.tagline.isEmpty ? loc.t("splash.tagline") : config.tagline
    }

    var body: some View {
        ZStack {
            // Always the brand-dark backdrop — never let a backend value turn the
            // splash white. (Backend still controls tagline / image / accent.)
            Theme.color(0x07090d).ignoresSafeArea()
            RadialGradient(colors: [config.accentColor.opacity(0.18), .clear],
                           center: .center, startRadius: 2, endRadius: 320)
                .ignoresSafeArea()

            VStack(spacing: 18) {
                // Optional remote ad/banner from the backend.
                if let url = URL(string: config.imageURL), !config.imageURL.isEmpty {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        ProgressView().tint(config.accentColor)
                    }
                    .frame(maxWidth: 280, maxHeight: 160)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                    .opacity(textIn ? 1 : 0)
                }

                ZStack {
                    Circle()
                        .stroke(config.accentColor.opacity(0.35), lineWidth: 2)
                        .frame(width: 140, height: 140)
                        .scaleEffect(ringScale)
                        .opacity(logoIn ? 0 : 0.9)

                    // Real MePonto logo asset.
                    Image("MePontoLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 104, height: 104)
                        .shadow(color: config.accentColor.opacity(0.45), radius: 24, y: 8)
                        .scaleEffect(logoIn ? 1 : 0.55)
                        .opacity(logoIn ? 1 : 0)
                }

                VStack(spacing: 6) {
                    Text(config.headline)
                        .font(.system(size: 34, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                    Text(tagline)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(config.accentColor)
                        .multilineTextAlignment(.center)
                }
                .opacity(textIn ? 1 : 0)
                .offset(y: textIn ? 0 : 10)
            }
            .padding(24)
        }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.6)) { logoIn = true }
            withAnimation(.easeOut(duration: 1.1)) { ringScale = 1.8 }
            withAnimation(.easeOut(duration: 0.6).delay(0.35)) { textIn = true }
        }
    }
}

// Wraps the splash over the main app; dismisses after config.duration.
// If the backend disables the splash, it is skipped entirely.
struct RootContainer: View {
    @EnvironmentObject var splash: SplashConfigStore
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @EnvironmentObject var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var showSplash = true

    var body: some View {
        ZStack {
            RootTabView()

            // Full-screen failure state with retry (e.g. backend unreachable).
            if store.loadState == .failed {
                ZStack {
                    Theme.background(scheme).ignoresSafeArea()
                    StateView(icon: "wifi.slash", message: loc.t("error.load"),
                              actionTitle: loc.t("common.retry")) {
                        Task { await store.load() }
                    }
                }
                .zIndex(2)
            }

            if showSplash && splash.config.enabled {
                SplashView(config: splash.config)
                    .transition(.opacity)
                    .zIndex(3)
            }
        }
        .sheet(isPresented: $auth.presentingAuth) {
            AuthView().presentationDetents([.large])
        }
        .task { await store.load() }
        .onChange(of: auth.isMember) { _, isMember in
            // Swap the backend to live PontoSys after login, back to mock on logout.
            if isMember {
                store.configure(api: LiveRiderAPI(memberName: auth.memberName ?? ""))
            } else {
                store.configure(api: MockRiderAPI())
            }
            Task { await store.load() }
        }
        .task {
            // Best-effort pull of backend-managed config for the NEXT launch.
            await splash.refresh()
        }
        .task {
            guard splash.config.enabled else { showSplash = false; return }
            try? await Task.sleep(nanoseconds: UInt64(splash.config.duration * 1_000_000_000))
            withAnimation(.easeInOut(duration: 0.5)) { showSplash = false }
        }
    }
}
