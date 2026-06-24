import SwiftUI

// 个人信息 / personal info — the rider views and completes the identity and
// payout details (name, CPF, phone, PIX) carried over when the backend enrolled
// them as a rider. PIX + CPF are required to receive payouts.
struct PersonalInfoView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var cpf = ""
    @State private var phone = ""
    @State private var pix = ""
    @State private var showSaved = false

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty &&
        !cpf.trimmingCharacters(in: .whitespaces).isEmpty &&
        !pix.trimmingCharacters(in: .whitespaces).isEmpty &&
        !phone.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        ZStack {
            Theme.background(scheme).ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Completion prompt when payout details are missing.
                    if !store.profile.isComplete {
                        HStack(spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.warning(scheme))
                            Text(loc.t("profile.completePrompt"))
                                .font(.caption).foregroundStyle(Theme.text(scheme))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(12)
                        .background(Theme.warning(scheme).opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                    }

                    // Read-only assignment from the backend.
                    Panel {
                        VStack(alignment: .leading, spacing: 10) {
                            infoRow(label: loc.t("member.ponto"), value: store.profile.ponto)
                            Divider().background(Theme.line(scheme))
                            infoRow(label: loc.t("member.leader"), value: store.profile.leader)
                            Divider().background(Theme.line(scheme))
                            infoRow(label: loc.t("member.id99"), value: store.profile.ninetyNineId)
                        }
                    }

                    // Editable identity + payout fields.
                    Panel {
                        VStack(alignment: .leading, spacing: 14) {
                            SectionHeader(title: loc.t("profile.payout"))
                            editField(loc.t("auth.name"), text: $name, icon: "person.fill")
                            editField("CPF", text: $cpf, icon: "creditcard.fill", keyboard: .numbersAndPunctuation)
                            editField(loc.t("auth.phone"), text: $phone, icon: "phone.fill", keyboard: .phonePad)
                            editField(loc.t("profile.pix"), text: $pix, icon: "qrcode", keyboard: .emailAddress)
                        }
                    }

                    PrimaryButton(title: loc.t("profile.save"), systemIcon: "checkmark", enabled: canSave) {
                        store.updateProfile(name: name, cpf: cpf, phone: phone, pix: pix)
                        showSaved = true
                    }
                }
                .padding(16)
            }
        }
        .navigationTitle(loc.t("profile.personalInfo"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            name = store.profile.name; cpf = store.profile.cpf
            phone = store.profile.phone; pix = store.profile.pix
        }
        .alert(loc.t("profile.saved"), isPresented: $showSaved) {
            Button(loc.t("common.done"), role: .cancel) { dismiss() }
        }
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(Theme.muted(scheme))
            Spacer()
            Text(value).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text(scheme))
        }
    }

    private func editField(_ label: String, text: Binding<String>, icon: String,
                           keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(Theme.muted(scheme))
            HStack(spacing: 10) {
                Image(systemName: icon).foregroundStyle(Theme.muted(scheme)).frame(width: 20)
                TextField(loc.t("profile.notSet"), text: text)
                    .foregroundStyle(Theme.text(scheme))
                    .keyboardType(keyboard)
                    .autocorrectionDisabled()
                    .accessibilityLabel(label)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(Theme.surfaceRaised(scheme))
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
        }
    }
}
