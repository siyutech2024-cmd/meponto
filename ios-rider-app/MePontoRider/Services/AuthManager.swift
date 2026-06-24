import SwiftUI

// Deferred login: the app opens for everyone as a GUEST. Public content (store
// catalog, shift schedule, map) is browsable without an account. Member-only
// actions (wallet, sign-up, redeem, check-in, profile) call requireMember(),
// which presents the login/register sheet when the user isn't authenticated.
//
// SCAFFOLD: production authenticates against the unified PontoSys RBAC/SSO and
// must store the session token in the Keychain (not AppStorage); raw passwords
// must never be handled on-device beyond the secure SSO exchange.
enum AuthState { case loading, guest, member }

@MainActor
final class AuthManager: ObservableObject {
    @AppStorage("auth_token") private var token: String = ""

    @Published var state: AuthState = .loading
    @Published var presentingAuth = false
    @Published var working = false
    @Published var errorMessage: String?

    var isMember: Bool { state == .member }

    /// The logged-in member's display name (used to scope live API reads).
    var memberName: String? { token.isEmpty ? nil : token }

    func bootstrap() {
        state = token.isEmpty ? .guest : .member
    }

    /// Returns true if already a member; otherwise opens the auth sheet and returns false.
    @discardableResult
    func requireMember() -> Bool {
        if isMember { return true }
        errorMessage = nil
        presentingAuth = true
        return false
    }

    // PontoSys member-login is phone-only; `id` carries the phone number.
    func login(id: String, password: String) async {
        working = true; errorMessage = nil
        let result = await APIClient().login(phone: id)
        switch result {
        case .success(let name):
            token = name              // store the member display name as the session marker
            state = .member
            presentingAuth = false
        case .failure:
            errorMessage = "auth.invalid"
        }
        working = false
    }

    func register(name: String, id: String, phone: String, password: String) async {
        working = true; errorMessage = nil
        try? await Task.sleep(nanoseconds: 800_000_000)
        if name.count >= 2, id.trimmingCharacters(in: .whitespaces).count >= 4,
           phone.count >= 6, password.count >= 4 {
            token = "mock-session-\(id)"
            state = .member
            presentingAuth = false
        } else {
            errorMessage = "auth.fillAll"
        }
        working = false
    }

    func logout() {
        token = ""
        errorMessage = nil
        state = .guest
        // Drop the PontoSys session cookie.
        if let cookies = HTTPCookieStorage.shared.cookies(for: API.baseURL) {
            cookies.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
        }
    }
}
