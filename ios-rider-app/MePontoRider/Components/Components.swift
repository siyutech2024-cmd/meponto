import SwiftUI

// Surface panel (no nested cards, radius <= 8, semantic tokens) per design-system.md.
struct Panel<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface(scheme))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius)
                    .stroke(Theme.line(scheme), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
    }
}

// Section header: short title + optional trailing action.
struct SectionHeader: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.headline)
                .foregroundStyle(Theme.text(scheme))
            Spacer()
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.subheadline)
                    .foregroundStyle(Theme.accent(scheme))
            }
        }
    }
}

// Status badge.
struct Badge: View {
    @Environment(\.colorScheme) private var scheme
    let text: String
    var tone: Tone = .neutral

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tone.bg(scheme))
            .foregroundStyle(tone.fg(scheme))
            .clipShape(Capsule())
    }
}

// Thin progress bar using the accent color.
struct ProgressBar: View {
    @Environment(\.colorScheme) private var scheme
    let value: Double // 0...1

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.surfaceRaised(scheme))
                Capsule()
                    .fill(Theme.accent(scheme))
                    .frame(width: max(0, min(1, value)) * geo.size.width)
            }
        }
        .frame(height: 6)
    }
}

// Primary action button (MePonto yellow).
struct PrimaryButton: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    var systemIcon: String? = nil
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemIcon { Image(systemName: systemIcon) }
                Text(title).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(enabled ? Theme.accent(scheme) : Theme.surfaceRaised(scheme))
            .foregroundStyle(enabled ? Theme.accentInk(scheme) : Theme.muted(scheme))
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
        }
        .disabled(!enabled)
    }
}

// Compact stat tile.
struct StatTile: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    let value: String
    let systemIcon: String
    let tone: Tone

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: systemIcon)
                .font(.title3)
                .foregroundStyle(tone == .neutral ? Theme.text(scheme) : tone.fg(scheme))
            Text(value)
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.text(scheme))
            Text(title)
                .font(.caption)
                .foregroundStyle(Theme.muted(scheme))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.surfaceRaised(scheme))
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
    }
}

// Tappable quick-action tile (icon + title + detail).
struct QuickActionTile: View {
    @Environment(\.colorScheme) private var scheme
    let icon: String
    let title: String
    let detail: String
    var tone: Tone = .neutral
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(tone == .neutral ? Theme.text(scheme) : tone.fg(scheme))
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text(scheme))
                    .fixedSize(horizontal: false, vertical: true)
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(Theme.muted(scheme))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
            .padding(14)
            .background(Theme.surface(scheme))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line(scheme)))
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
        }
        .buttonStyle(.plain)
    }
}

// A simple labelled metric used in performance row.
struct Metric: View {
    @Environment(\.colorScheme) private var scheme
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.text(scheme))
            Text(label)
                .font(.caption2)
                .foregroundStyle(Theme.muted(scheme))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}
