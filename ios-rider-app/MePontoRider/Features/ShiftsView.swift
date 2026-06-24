import SwiftUI

struct ShiftsView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @EnvironmentObject var auth: AuthManager
    @Environment(\.colorScheme) private var scheme

    @State private var selectedWeek = 0
    @State private var selectedDay: String = ""
    @State private var agendaPage = 0
    private let agendaPageSize = 3

    private var weeks: [[ScheduleDay]] { store.riderWeeks }
    private var weekIndex: Int { min(max(selectedWeek, 0), max(weeks.count - 1, 0)) }
    private var weekDays: [ScheduleDay] { weeks.isEmpty ? [] : weeks[weekIndex] }
    private var activeDay: String {
        if !selectedDay.isEmpty, weekDays.contains(where: { $0.id == selectedDay }) { return selectedDay }
        return weekDays.first?.id ?? ""
    }
    private var dayShifts: [Shift] { store.shifts(on: activeDay).sorted { $0.window < $1.window } }

    // Agenda (我的日程) pagination
    private var agenda: [Shift] { store.subscribedShifts }
    private var agendaPageCount: Int { max(1, Int(ceil(Double(agenda.count) / Double(agendaPageSize)))) }
    private var agendaSlice: [Shift] {
        let p = min(agendaPage, agendaPageCount - 1)
        let start = p * agendaPageSize
        return Array(agenda[start..<min(start + agendaPageSize, agenda.count)])
    }

    var body: some View {
        Screen(title: loc.t("shifts.title")) {
            pontoHeader

            if auth.isMember && !agenda.isEmpty { agendaPanel }

            weekSwitcher
            dayStrip

            // Selected day's shifts — full list (scrollable), tappable rows
            Panel {
                VStack(alignment: .leading, spacing: 0) {
                    if dayShifts.isEmpty {
                        Text(loc.t("shifts.empty"))
                            .font(.subheadline).foregroundStyle(Theme.muted(scheme))
                            .frame(maxWidth: .infinity).padding(.vertical, 24)
                    } else {
                        ForEach(Array(dayShifts.enumerated()), id: \.element.id) { idx, shift in
                            NavigationLink { ShiftDetailScreen(shiftID: shift.id) } label: { ScheduleRow(shift: shift) }
                                .buttonStyle(.plain)
                            if idx < dayShifts.count - 1 { Divider().background(Theme.line(scheme)) }
                        }
                    }
                }
            }

            Text(loc.t("shifts.noPayNote"))
                .font(.caption2)
                .foregroundStyle(Theme.muted(scheme))
                .padding(.horizontal, 4)
        }
        .onChange(of: selectedWeek) { _, _ in selectedDay = "" }
    }

    // 网点 header — the rider is bound to one ponto
    private var pontoHeader: some View {
        Panel {
            HStack(spacing: 12) {
                Image(systemName: "mappin.and.ellipse").foregroundStyle(Theme.accent(scheme))
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.profile.ponto).font(.subheadline.weight(.bold)).foregroundStyle(Theme.text(scheme))
                    Text(loc.t("shifts.pontoOnly")).font(.caption2).foregroundStyle(Theme.muted(scheme))
                }
                Spacer()
                Badge(text: store.profile.bairro, tone: .neutral)
            }
        }
    }

    private var agendaPanel: some View {
        Panel {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(loc.t("shifts.agenda")).font(.headline).foregroundStyle(Theme.text(scheme))
                    Spacer()
                    Text("\(agenda.count)").font(.caption.weight(.bold)).foregroundStyle(Theme.muted(scheme))
                }
                ForEach(agendaSlice) { s in
                    HStack(spacing: 10) {
                        Image(systemName: "calendar.badge.checkmark").foregroundStyle(Theme.ok(scheme))
                        VStack(alignment: .leading, spacing: 1) {
                            Text("\(s.weekday) \(s.dayLabel) · \(s.window)")
                                .font(.caption.weight(.semibold)).foregroundStyle(Theme.text(scheme))
                            Text(s.zone).font(.caption2).foregroundStyle(Theme.muted(scheme))
                        }
                        Spacer()
                        Badge(text: loc.t(s.status.key), tone: s.status.tone)
                    }
                }
                if agendaPageCount > 1 {
                    HStack {
                        Button { if agendaPage > 0 { agendaPage -= 1 } } label: { Image(systemName: "chevron.left").padding(6) }
                            .disabled(agendaPage == 0).opacity(agendaPage == 0 ? 0.3 : 1)
                            .accessibilityLabel(loc.t("common.prev"))
                        Spacer()
                        Text("\(min(agendaPage, agendaPageCount - 1) + 1) / \(agendaPageCount)")
                            .font(.caption.weight(.semibold)).foregroundStyle(Theme.muted(scheme))
                        Spacer()
                        Button { if agendaPage < agendaPageCount - 1 { agendaPage += 1 } } label: { Image(systemName: "chevron.right").padding(6) }
                            .disabled(agendaPage >= agendaPageCount - 1).opacity(agendaPage >= agendaPageCount - 1 ? 0.3 : 1)
                            .accessibilityLabel(loc.t("common.next"))
                    }
                    .foregroundStyle(Theme.text(scheme))
                    .padding(.top, 4)
                }
            }
        }
    }

    // Week switcher: ‹ This week / Next week (date range) ›
    private var weekSwitcher: some View {
        let label: String = {
            let rel = weekIndex == 0 ? loc.t("shifts.thisWeek") : (weekIndex == 1 ? loc.t("shifts.nextWeek") : "")
            let range = (weekDays.first?.dayLabel).map { f in "\(f) – \(weekDays.last?.dayLabel ?? f)" } ?? ""
            return rel.isEmpty ? range : "\(rel) · \(range)"
        }()
        return HStack {
            Button { if weekIndex > 0 { selectedWeek = weekIndex - 1 } } label: {
                Image(systemName: "chevron.left").padding(8)
            }
            .disabled(weekIndex == 0)
            .opacity(weekIndex == 0 ? 0.3 : 1)
            .accessibilityLabel(loc.t("common.prev"))

            Spacer()
            VStack(spacing: 2) {
                Image(systemName: "calendar").font(.caption).foregroundStyle(Theme.accent(scheme))
                Text(label).font(.subheadline.weight(.bold)).foregroundStyle(Theme.text(scheme))
            }
            Spacer()

            Button { if weekIndex < weeks.count - 1 { selectedWeek = weekIndex + 1 } } label: {
                Image(systemName: "chevron.right").padding(8)
            }
            .disabled(weekIndex >= weeks.count - 1)
            .opacity(weekIndex >= weeks.count - 1 ? 0.3 : 1)
            .accessibilityLabel(loc.t("common.next"))
        }
        .foregroundStyle(Theme.text(scheme))
        .padding(.horizontal, 4)
    }

    private var dayStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(weekDays) { day in
                    let isActive = day.id == activeDay
                    Button { selectedDay = day.id } label: {
                        VStack(spacing: 6) {
                            Text(day.weekday.uppercased())
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(isActive ? Theme.accentInk(scheme) : Theme.muted(scheme))
                            Text(day.dayLabel)
                                .font(.subheadline.weight(.heavy))
                                .foregroundStyle(isActive ? Theme.accentInk(scheme) : Theme.text(scheme))
                            HStack(spacing: 3) {
                                Circle()
                                    .fill(day.subscribedCount > 0 ? Theme.ok(scheme) : (isActive ? Theme.accentInk(scheme).opacity(0.5) : Theme.muted(scheme).opacity(0.5)))
                                    .frame(width: 5, height: 5)
                                Text("\(day.shiftIDs.count)")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(isActive ? Theme.accentInk(scheme) : Theme.muted(scheme))
                            }
                        }
                        .frame(width: 56)
                        .padding(.vertical, 12)
                        .background(isActive ? Theme.accent(scheme) : Theme.surface(scheme))
                        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(isActive ? Color.clear : Theme.line(scheme)))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

}

// Compact tappable row in the day's schedule table.
struct ScheduleRow: View {
    @EnvironmentObject var loc: LocalizationManager
    @Environment(\.colorScheme) private var scheme
    let shift: Shift

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(shift.window).font(.subheadline.weight(.bold)).foregroundStyle(Theme.text(scheme))
                    if shift.critical {
                        Text(loc.t("shifts.critical")).font(.caption2.weight(.bold))
                            .padding(.horizontal, 6).padding(.vertical, 1)
                            .background(Theme.danger(scheme).opacity(0.15))
                            .foregroundStyle(Theme.danger(scheme))
                            .clipShape(Capsule())
                    }
                }
                Text("\(loc.t("shifts.hotzone")): \(shift.hotzone)").font(.caption).foregroundStyle(Theme.muted(scheme))
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                if shift.subscribed {
                    Badge(text: loc.t(shift.status.key), tone: shift.status.tone)
                } else {
                    Text("\(shift.openSpots)/\(shift.totalSpots)")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(shift.openSpots == 0 ? Theme.danger(scheme) : Theme.text(scheme))
                    Text(loc.t("shifts.spots")).font(.caption2).foregroundStyle(Theme.muted(scheme))
                }
            }
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted(scheme))
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

// Detail screen pushed when tapping a schedule cell: subscribe / cancel.
struct ShiftDetailScreen: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @EnvironmentObject var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID

    private var shift: Shift? { store.shifts.first { $0.id == shiftID } }

    var body: some View {
        ZStack {
            Theme.background(scheme).ignoresSafeArea()
            content
        }
        .navigationTitle(loc.t("shifts.title"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let s = shift {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(s.weekday) \(s.dayLabel) · \(s.window)")
                        .font(.title3.weight(.bold)).foregroundStyle(Theme.text(scheme))
                    Text(s.zone).font(.subheadline).foregroundStyle(Theme.muted(scheme))
                }
                HStack(spacing: 8) {
                    Badge(text: "\(loc.t("shifts.hotzone")): \(s.hotzone)", tone: .accent)
                    Badge(text: "\(loc.t("shift.station")): \(s.station)", tone: .neutral)
                    if s.critical { Badge(text: loc.t("shifts.critical"), tone: .danger) }
                    if s.subscribed { Badge(text: loc.t(s.status.key), tone: s.status.tone) }
                }
                HStack {
                    Image(systemName: "person.3.fill").foregroundStyle(Theme.muted(scheme))
                    Text("\(s.takenSpots)/\(s.totalSpots) · \(s.openSpots) \(loc.t("shifts.spots"))")
                        .font(.subheadline).foregroundStyle(Theme.textSoft(scheme))
                }
                Text(loc.t("shifts.noPayNote"))
                    .font(.caption).foregroundStyle(Theme.muted(scheme))
                Spacer()
                if s.subscribed {
                    Button(role: .destructive) {
                        store.toggleSubscription(s); dismiss()
                    } label: {
                        Text(loc.t("shifts.cancel")).frame(maxWidth: .infinity).padding(.vertical, 12)
                            .foregroundStyle(Theme.danger(scheme))
                            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.danger(scheme).opacity(0.4)))
                    }
                } else {
                    PrimaryButton(title: loc.t("shifts.subscribe"), systemIcon: "checkmark.circle.fill",
                                  enabled: s.openSpots > 0) {
                        guard auth.requireMember() else { return }
                        store.toggleSubscription(s); dismiss()
                    }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.background(scheme))
    }
}
