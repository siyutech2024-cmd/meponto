import SwiftUI

// MePonto design tokens, mirrored from docs/design-system.md and app/globals.css.
// Dark is the default palette; a light palette is provided for the system toggle.
// Components must reference these semantic tokens, never raw hex.
enum Theme {

    // MARK: - Hex helper
    static func color(_ hex: UInt32, alpha: Double = 1) -> Color {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        return Color(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }

    // MARK: - Semantic tokens (dynamic: resolve per color scheme)
    static func background(_ s: ColorScheme) -> Color { s == .dark ? color(0x07090d) : color(0xf5f7fa) }
    static func surface(_ s: ColorScheme) -> Color { s == .dark ? color(0x0d1117) : color(0xffffff) }
    static func surfaceRaised(_ s: ColorScheme) -> Color { s == .dark ? color(0x111722) : color(0xf8fafc) }
    static func surfaceHover(_ s: ColorScheme) -> Color { s == .dark ? color(0x172031) : color(0xeef3f8) }
    static func line(_ s: ColorScheme) -> Color { s == .dark ? color(0x263244) : color(0xd8e0ea) }
    static func text(_ s: ColorScheme) -> Color { s == .dark ? color(0xf8fafc) : color(0x111827) }
    static func textSoft(_ s: ColorScheme) -> Color { s == .dark ? color(0xd7dee8) : color(0x334155) }
    static func muted(_ s: ColorScheme) -> Color { s == .dark ? color(0x9aa6b8) : color(0x64748b) }
    static func accent(_ s: ColorScheme) -> Color { s == .dark ? color(0xffd100) : color(0xd9a900) }
    static func accentInk(_ s: ColorScheme) -> Color { color(0x171400) }
    static func danger(_ s: ColorScheme) -> Color { s == .dark ? color(0xff5c70) : color(0xdc2626) }
    static func warning(_ s: ColorScheme) -> Color { s == .dark ? color(0xffb454) : color(0xb45309) }
    static func ok(_ s: ColorScheme) -> Color { s == .dark ? color(0x2dd4bf) : color(0x0f766e) }

    static let radius: CGFloat = 8
    static let radiusSmall: CGFloat = 6
}

// Status tone used by Badge and ledgers.
enum Tone {
    case neutral, accent, ok, warning, danger

    func fg(_ s: ColorScheme) -> Color {
        switch self {
        case .neutral: return Theme.textSoft(s)
        case .accent: return Theme.accent(s)
        case .ok: return Theme.ok(s)
        case .warning: return Theme.warning(s)
        case .danger: return Theme.danger(s)
        }
    }

    func bg(_ s: ColorScheme) -> Color {
        switch self {
        case .neutral: return Theme.surfaceRaised(s)
        default: return fg(s).opacity(0.14)
        }
    }
}

// Convenience environment-aware accessor for views.
struct ThemeColors {
    let scheme: ColorScheme
    var background: Color { Theme.background(scheme) }
    var surface: Color { Theme.surface(scheme) }
    var surfaceRaised: Color { Theme.surfaceRaised(scheme) }
    var surfaceHover: Color { Theme.surfaceHover(scheme) }
    var line: Color { Theme.line(scheme) }
    var text: Color { Theme.text(scheme) }
    var textSoft: Color { Theme.textSoft(scheme) }
    var muted: Color { Theme.muted(scheme) }
    var accent: Color { Theme.accent(scheme) }
    var accentInk: Color { Theme.accentInk(scheme) }
    var danger: Color { Theme.danger(scheme) }
    var warning: Color { Theme.warning(scheme) }
    var ok: Color { Theme.ok(scheme) }
}

extension EnvironmentValues {
    var t: ThemeColors { ThemeColors(scheme: self.colorScheme) }
}
