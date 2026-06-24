import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @EnvironmentObject var splash: SplashConfigStore
    @EnvironmentObject var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @AppStorage("appearance") private var appearance: String = "system"
    @State private var showAuth = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background(scheme).ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if auth.isMember { header } else { guestHeader }

                        // Personal info (name / CPF / phone / PIX) — member only
                        if auth.isMember {
                            NavigationLink { PersonalInfoView() } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "person.text.rectangle").foregroundStyle(Theme.accent(scheme))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(loc.t("profile.personalInfo")).fontWeight(.semibold)
                                            .foregroundStyle(Theme.text(scheme))
                                        if !store.profile.isComplete {
                                            Text(loc.t("profile.completePrompt"))
                                                .font(.caption2).foregroundStyle(Theme.warning(scheme))
                                                .fixedSize(horizontal: false, vertical: true)
                                        }
                                    }
                                    Spacer()
                                    if !store.profile.isComplete {
                                        Circle().fill(Theme.warning(scheme)).frame(width: 8, height: 8)
                                    }
                                    Image(systemName: "chevron.right").foregroundStyle(Theme.muted(scheme))
                                }
                                .padding(16)
                                .background(Theme.surface(scheme))
                                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line(scheme)))
                                .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                            }
                            .buttonStyle(.plain)
                        }

                        // Language
                        Panel {
                            VStack(alignment: .leading, spacing: 12) {
                                SectionHeader(title: loc.t("profile.language"))
                                ForEach(AppLanguage.allCases) { lang in
                                    Button { loc.setLanguage(lang) } label: {
                                        HStack {
                                            Text(lang.flag)
                                            Text(lang.nativeName).foregroundStyle(Theme.text(scheme))
                                            Spacer()
                                            if loc.language == lang {
                                                Image(systemName: "checkmark").foregroundStyle(Theme.accent(scheme))
                                            }
                                        }
                                        .padding(.vertical, 8)
                                    }
                                }
                            }
                        }

                        // Appearance
                        Panel {
                            VStack(alignment: .leading, spacing: 12) {
                                SectionHeader(title: loc.t("profile.appearance"))
                                Picker(loc.t("profile.appearance"), selection: $appearance) {
                                    Text(loc.t("profile.system")).tag("system")
                                    Text(loc.t("profile.dark")).tag("dark")
                                    Text(loc.t("profile.light")).tag("light")
                                }
                                .pickerStyle(.segmented)
                            }
                        }

                        // 启动页(后台设置) — local preview of backend-managed splash
                        Panel {
                            VStack(alignment: .leading, spacing: 12) {
                                SectionHeader(title: loc.t("admin.splash"))
                                Toggle(loc.t("admin.splashEnabled"), isOn: Binding(
                                    get: { splash.config.enabled },
                                    set: { v in var c = splash.config; c.enabled = v; splash.update(c) }))
                                .tint(Theme.accent(scheme))

                                HStack {
                                    Text(loc.t("admin.splashTagline")).font(.subheadline).foregroundStyle(Theme.textSoft(scheme))
                                    Spacer()
                                    TextField(loc.t("splash.tagline"), text: Binding(
                                        get: { splash.config.tagline },
                                        set: { v in var c = splash.config; c.tagline = v; splash.update(c) }))
                                    .multilineTextAlignment(.trailing)
                                    .foregroundStyle(Theme.text(scheme))
                                }

                                Stepper(value: Binding(
                                    get: { max(1, splash.config.durationMs / 1000) },
                                    set: { v in var c = splash.config; c.durationMs = v * 1000; splash.update(c) }),
                                    in: 1...6) {
                                    Text("\(loc.t("admin.splashDuration")): \(max(1, splash.config.durationMs / 1000))")
                                        .font(.subheadline).foregroundStyle(Theme.textSoft(scheme))
                                }

                                Text(loc.t("admin.splashNote"))
                                    .font(.caption2).foregroundStyle(Theme.muted(scheme))

                                Button(loc.t("admin.resetBackend")) { splash.resetToDefault() }
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Theme.accent(scheme))
                            }
                        }

                        NavigationLink {
                            SupportView()
                        } label: {
                            HStack {
                                Image(systemName: "lifepreserver")
                                Text(loc.t("support.title")).fontWeight(.semibold)
                                Spacer()
                                Image(systemName: "chevron.right")
                            }
                            .foregroundStyle(Theme.text(scheme))
                            .padding(16)
                            .background(Theme.surface(scheme))
                            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line(scheme)))
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                        }

                        if auth.isMember {
                            Button(role: .destructive) { auth.logout(); dismiss() } label: {
                                Text(loc.t("profile.logout"))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .foregroundStyle(Theme.danger(scheme))
                                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.danger(scheme).opacity(0.4)))
                            }
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle(loc.t("profile.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(loc.t("common.close")) { dismiss() }
                }
            }
            .sheet(isPresented: $showAuth) { AuthView() }
        }
    }

    // Guest header → login / register CTA.
    private var guestHeader: some View {
        Button { showAuth = true } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(Theme.accent(scheme)).frame(width: 56, height: 56)
                    Image(systemName: "person.fill").font(.title3).foregroundStyle(Theme.accentInk(scheme))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(loc.t("profile.guest")).font(.title3.weight(.bold)).foregroundStyle(Theme.text(scheme))
                    Text("\(loc.t("auth.login")) / \(loc.t("auth.register"))")
                        .font(.subheadline).foregroundStyle(Theme.accent(scheme))
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Theme.muted(scheme))
            }
        }
        .buttonStyle(.plain)
    }

    private var header: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(Theme.accent(scheme)).frame(width: 56, height: 56)
                Text(String(store.riderName.prefix(1)))
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.accentInk(scheme))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(store.riderName).font(.title3.weight(.bold)).foregroundStyle(Theme.text(scheme))
                Text("\(store.pointsBalance) pts · \(loc.t("home.rider"))")
                    .font(.subheadline).foregroundStyle(Theme.muted(scheme))
            }
            Spacer()
        }
    }
}
