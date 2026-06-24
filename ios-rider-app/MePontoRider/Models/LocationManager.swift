import Foundation
import CoreLocation

// Publishes the rider's current location so the map can center on them and
// rank nearby service points by distance. Uses when-in-use authorization
// (NSLocationWhenInUseUsageDescription is set in build settings).
final class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()

    @Published var coordinate: CLLocationCoordinate2D?
    @Published var authorized = false
    @Published var denied = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func request() {
        manager.requestWhenInUseAuthorization()
    }

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        switch m.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            authorized = true; denied = false
            m.startUpdatingLocation()
        case .denied, .restricted:
            authorized = false; denied = true
        default:
            authorized = false; denied = false
        }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        if let l = locs.last { coordinate = l.coordinate }
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        // Keep last known/none; the map falls back to the ponto region.
    }

    // Distance in meters from the rider to a coordinate, if known.
    func meters(to c: CLLocationCoordinate2D) -> Double? {
        guard let here = coordinate else { return nil }
        return CLLocation(latitude: here.latitude, longitude: here.longitude)
            .distance(from: CLLocation(latitude: c.latitude, longitude: c.longitude))
    }
}

func formatDistance(_ meters: Double) -> String {
    meters >= 1000 ? String(format: "%.1f km", meters / 1000) : "\(Int(meters)) m"
}
