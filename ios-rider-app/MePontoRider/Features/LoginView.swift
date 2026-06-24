import SwiftUI

// Login / Register sheet, presented on demand for member-only actions.
struct AuthView: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var loc: LocalizationManager
    @Environment(\.dismiss) private var dismiss

    enum Mode { case login, register }
    @State private var mode: Mode = .login
    @State private var name = ""
    @State private var phone = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            Theme.color(0x07090d).ignoresSafeArea()
            RadialGradient(colors: [Theme.color(0xffd100).opacity(0.16), .clear],
                           center: .top, startRadius: 2, endRadius: 360).ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    HStack {
                        Spacer()
                        Button(loc.t("common.close")) { dismiss() }
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    Image("MePontoLogo").resizable().scaledToFit().frame(width: 72, height: 72)
                        .accessibilityHidden(true)
                    Text(loc.t("auth.welcome"))
                        .font(.title3.weight(.bold)).foregroundStyle(.white)

                    // Mode switch
                    Picker("", selection: $mode) {
                        Text(loc.t("auth.login")).tag(Mode.login)
                        Text(loc.t("auth.register")).tag(Mode.register)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 8)

                    VStack(spacing: 12) {
                        if mode == .register {
                            field(icon: "person.fill", placeholder: loc.t("auth.name"), text: $name, secure: false)
                        }
                        // Login is by phone (PontoSys member-login), not 99 ID.
                        field(icon: "phone.fill", placeholder: loc.t("auth.phone"), text: $phone, secure: false)
                            .keyboardType(.phonePad)
                        field(icon: "lock.fill", placeholder: loc.t("auth.password"), text: $password, secure: true)

                        if let err = auth.errorMessage {
                            Text(loc.t(err)).font(.caption).foregroundStyle(Theme.color(0xff5c70))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Button { submit() } label: {
                            HStack {
                                if auth.working { ProgressView().tint(Theme.color(0x171400)) }
                                Text(loc.t(mode == .login ? "auth.login" : "auth.register")).fontWeight(.bold)
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                            .background(Theme.color(0xffd100)).foregroundStyle(Theme.color(0x171400))
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                        }
                        .disabled(auth.working)
                    }
                    .padding(18)
                    .background(Color.white.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                    Text(loc.t("auth.note"))
                        .font(.caption2).foregroundStyle(.white.opacity(0.5))
                        .multilineTextAlignment(.center)
                }
                .padding(24)
            }
        }
    }

    private func submit() {
        Task {
            if mode == .login { await auth.login(id: phone, password: password) }
            else { await auth.register(name: name, id: phone, phone: phone, password: password) }
        }
    }

    @ViewBuilder
    private func field(icon: String, placeholder: String, text: Binding<String>, secure: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(.white.opacity(0.6)).frame(width: 20)
            if secure {
                SecureField("", text: text, prompt: Text(placeholder).foregroundColor(.white.opacity(0.4)))
                    .foregroundStyle(.white)
            } else {
                TextField("", text: text, prompt: Text(placeholder).foregroundColor(.white.opacity(0.4)))
                    .foregroundStyle(.white)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
        .accessibilityLabel(placeholder)
    }
}

// Card shown to guests where personal content would be — taps open the auth sheet.
struct LoginPromptCard: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var loc: LocalizationManager
    @Environment(\.colorScheme) private var scheme
    var message: String? = nil

    var body: some View {
        Button { auth.requireMember() } label: {
            HStack(spacing: 12) {
                Image(systemName: "person.crop.circle.badge.plus").font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(loc.t("auth.welcome")).font(.subheadline.weight(.bold))
                    Text(message ?? loc.t("auth.guestPrompt")).font(.caption)
                        .foregroundStyle(Theme.accentInk(scheme).opacity(0.75))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Image(systemName: "chevron.right")
            }
            .foregroundStyle(Theme.accentInk(scheme))
            .padding(16)
            .background(Theme.accent(scheme))
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
        }
        .buttonStyle(.plain)
    }
}

// Shared empty / error state used by lists and load failures.
struct StateView: View {
    @Environment(\.colorScheme) private var scheme
    let icon: String
    let message: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 40)).foregroundStyle(Theme.muted(scheme))
            Text(message).font(.subheadline).foregroundStyle(Theme.muted(scheme))
                .multilineTextAlignment(.center)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.accent(scheme))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    }
}
