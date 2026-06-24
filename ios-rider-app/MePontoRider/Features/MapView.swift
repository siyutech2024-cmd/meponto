import SwiftUI
import MapKit

struct MapTabView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @Environment(\.colorScheme) private var scheme
    @Environment(\.openURL) private var openURL
    @StateObject private var location = LocationManager()

    // Fallback region = the rider's ponto area (São Paulo / Liberdade).
    private let fallback = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: -23.5505, longitude: -46.6333),
        span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05))

    @State private var camera: MapCameraPosition = .automatic
    @State private var selected: Partner?

    // Partners ranked by distance from the rider (when location is known).
    private var rankedPartners: [Partner] {
        store.partners.sorted { a, b in
            let da = location.meters(to: a.coordinate) ?? .greatestFiniteMagnitude
            let db = location.meters(to: b.coordinate) ?? .greatestFiniteMagnitude
            return da < db
        }
    }

    private func distanceText(_ p: Partner) -> String {
        if let m = location.meters(to: p.coordinate) { return formatDistance(m) }
        return p.distance
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                Map(position: $camera) {
                    UserAnnotation()
                    ForEach(rankedPartners) { p in
                        Annotation(p.name, coordinate: p.coordinate) {
                            Button { selected = p } label: {
                                ZStack {
                                    Circle().fill(Theme.accent(scheme)).frame(width: 30, height: 30)
                                    Image(systemName: icon(for: p.category))
                                        .font(.caption2).foregroundStyle(Theme.accentInk(scheme))
                                }
                                .shadow(radius: 3)
                            }
                        }
                    }
                }
                .mapControls { MapUserLocationButton() }
                .ignoresSafeArea(edges: .top)

                if !location.authorized {
                    locationBanner
                }
                partnerList
            }
            .navigationTitle(loc.t("map.title"))
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                location.request()
                camera = .userLocation(fallback: .region(fallback))
            }
            .sheet(item: $selected) { partner in
                PartnerSheet(partner: partner, distance: distanceText(partner)) {
                    let url = URL(string: "http://maps.apple.com/?daddr=\(partner.latitude),\(partner.longitude)")!
                    openURL(url)
                }
                .presentationDetents([.medium, .large])
            }
        }
    }

    private func icon(for category: String) -> String {
        switch category {
        case "Combustível": return "fuelpump.fill"
        case "Veículo": return "car.fill"
        case "Manutenção": return "wrench.and.screwdriver.fill"
        default: return "mappin"
        }
    }

    private var locationBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "location.slash")
            Text(loc.t("map.enableLocation")).font(.caption)
            Spacer()
            Button(loc.t("map.navigate")) { location.request() }
                .font(.caption.weight(.semibold)).foregroundStyle(Theme.accent(scheme))
        }
        .padding(10)
        .background(Theme.surface(scheme))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line(scheme)))
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    private var partnerList: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(rankedPartners) { p in
                    Button { selected = p } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 6) {
                                Image(systemName: icon(for: p.category)).font(.caption2).foregroundStyle(Theme.accent(scheme))
                                Text(p.name).font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Theme.text(scheme)).lineLimit(1)
                            }
                            Text("\(p.category) · \(distanceText(p))")
                                .font(.caption2).foregroundStyle(Theme.muted(scheme))
                            HStack(spacing: 4) {
                                StarsView(rating: p.rating)
                                Text(String(format: "%.1f (%d)", p.rating, p.reviewCount))
                                    .font(.caption2).foregroundStyle(Theme.muted(scheme))
                            }
                            Badge(text: "\(loc.t("map.discount")) R$ \(p.discountBRL)", tone: .ok)
                        }
                        .frame(width: 210, alignment: .leading)
                        .padding(12)
                        .background(Theme.surface(scheme))
                        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line(scheme)))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
    }
}

// Static star rating display (supports halves).
struct StarsView: View {
    @Environment(\.colorScheme) private var scheme
    let rating: Double
    var size: CGFloat = 12

    var body: some View {
        HStack(spacing: 1) {
            ForEach(0..<5, id: \.self) { i in
                Image(systemName: symbol(for: i))
                    .font(.system(size: size))
                    .foregroundStyle(Theme.accent(scheme))
            }
        }
    }

    private func symbol(for i: Int) -> String {
        let v = rating - Double(i)
        if v >= 1 { return "star.fill" }
        if v >= 0.5 { return "star.leadinghalf.filled" }
        return "star"
    }
}

struct PartnerSheet: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var loc: LocalizationManager
    @EnvironmentObject var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    let partner: Partner
    let distance: String
    let onNavigate: () -> Void

    @State private var myRating = 0
    @State private var myComment = ""

    // Live partner (reflects rating/count updated after a review).
    private var live: Partner { store.partners.first { $0.id == partner.id } ?? partner }
    private var reviews: [PartnerReview] { store.reviews(for: partner) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(live.name).font(.title3.weight(.bold)).foregroundStyle(Theme.text(scheme))
                    Text("\(live.category) · \(live.neighborhood) · \(distance)")
                        .font(.subheadline).foregroundStyle(Theme.muted(scheme))
                }

                HStack(spacing: 6) {
                    StarsView(rating: live.rating, size: 14)
                    Text(String(format: "%.1f", live.rating)).font(.subheadline.weight(.bold)).foregroundStyle(Theme.text(scheme))
                    Text("· \(live.reviewCount) \(loc.t("map.reviews"))").font(.caption).foregroundStyle(Theme.muted(scheme))
                }

                HStack(spacing: 6) {
                    Image(systemName: "checkmark.seal").font(.caption).foregroundStyle(Theme.ok(scheme))
                    Text("\(loc.t("map.service")): \(live.services)")
                        .font(.subheadline).foregroundStyle(Theme.textSoft(scheme))
                }
                HStack(spacing: 8) {
                    Badge(text: "\(loc.t("map.discount")) R$ \(live.discountBRL)", tone: .ok)
                    Badge(text: "Partner +\(live.partnerPoints) pts", tone: .accent)
                }

                PrimaryButton(title: loc.t("map.navigate"), systemIcon: "location.fill", action: onNavigate)

                Divider().background(Theme.line(scheme))

                // Write a review
                VStack(alignment: .leading, spacing: 8) {
                    Text(loc.t("map.writeReview")).font(.headline).foregroundStyle(Theme.text(scheme))
                    HStack(spacing: 6) {
                        ForEach(1...5, id: \.self) { i in
                            Button {
                                guard auth.requireMember() else { return }
                                myRating = i
                            } label: {
                                Image(systemName: i <= myRating ? "star.fill" : "star")
                                    .font(.title3).foregroundStyle(Theme.accent(scheme))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(i)")
                        }
                    }
                    TextField(loc.t("map.comment"), text: $myComment, axis: .vertical)
                        .lineLimit(1...3)
                        .padding(10)
                        .background(Theme.surfaceRaised(scheme))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                    PrimaryButton(title: loc.t("map.submit"), systemIcon: "paperplane.fill",
                                  enabled: myRating > 0) {
                        guard auth.requireMember() else { return }
                        store.addReview(to: partner, rating: myRating, comment: myComment)
                        myRating = 0; myComment = ""
                    }
                }

                // Reviews list
                VStack(alignment: .leading, spacing: 10) {
                    Text(loc.t("map.reviews")).font(.headline).foregroundStyle(Theme.text(scheme))
                    if reviews.isEmpty {
                        Text(loc.t("map.noReviews")).font(.subheadline).foregroundStyle(Theme.muted(scheme))
                    } else {
                        ForEach(reviews) { r in
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text(r.author).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text(scheme))
                                    Spacer()
                                    StarsView(rating: Double(r.rating))
                                    Text(r.dateText).font(.caption2).foregroundStyle(Theme.muted(scheme))
                                }
                                if !r.comment.isEmpty {
                                    Text(r.comment).font(.caption).foregroundStyle(Theme.textSoft(scheme))
                                }
                            }
                            if r.id != reviews.last?.id { Divider().background(Theme.line(scheme)) }
                        }
                    }
                }
            }
            .padding(20)
        }
        .background(Theme.background(scheme))
    }
}
