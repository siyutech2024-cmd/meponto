import SwiftUI

struct SupportView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @Environment(\.colorScheme) private var scheme

    private let faqs: [(String, String)] = [
        ("Como solicitar saque?", "Vá em Carteira › Solicitar saque. O PIX cai em até 30 min."),
        ("Como me inscrever em um turno?", "Abra Turnos, escolha uma janela com vagas e toque em Inscrever-se."),
        ("Como usar pontos na loja?", "Em Loja, escolha um item e toque em Resgatar se houver saldo."),
    ]

    var body: some View {
        Screen(title: loc.t("support.title")) {
            Panel {
                VStack(spacing: 0) {
                    ForEach(Array(store.helpActions.enumerated()), id: \.element.id) { idx, action in
                        HStack(spacing: 12) {
                            ZStack {
                                Circle().fill(action.tone.bg(scheme)).frame(width: 36, height: 36)
                                Image(systemName: action.systemIcon).foregroundStyle(action.tone.fg(scheme))
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(loc.t(action.titleKey)).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text(scheme))
                                Text(action.detail).font(.caption).foregroundStyle(Theme.muted(scheme))
                            }
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(Theme.muted(scheme))
                        }
                        .padding(.vertical, 10)
                        if idx < store.helpActions.count - 1 { Divider().background(Theme.line(scheme)) }
                    }
                }
            }

            Panel {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader(title: loc.t("support.faq"))
                    ForEach(faqs, id: \.0) { q, a in
                        DisclosureGroup {
                            Text(a).font(.caption).foregroundStyle(Theme.muted(scheme))
                                .padding(.top, 4)
                        } label: {
                            Text(q).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.textSoft(scheme))
                        }
                        .tint(Theme.accent(scheme))
                    }
                }
            }
        }
    }
}
