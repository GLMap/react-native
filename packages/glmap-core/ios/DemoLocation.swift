import CoreLocation
import ExpoModulesCore

/// Foreground location updates. Main queue only.
public final class DemoLocation: NSObject, CLLocationManagerDelegate {
    public private(set) lazy var manager: CLLocationManager = {
        let manager = CLLocationManager()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        return manager
    }()
    private var waiting: [Promise] = []
    var onLocation: (([String: Any?]) -> Void)?

    func start(_ promise: Promise) {
        switch manager.authorizationStatus {
        case .notDetermined:
            waiting.append(promise)
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            manager.startUpdatingLocation()
            promise.resolve(nil)
        default:
            promise.reject("permission_denied", "Location permission is required")
        }
    }
    func stop() {
        manager.stopUpdatingLocation()
        let replies = waiting; waiting.removeAll()
        replies.forEach { $0.reject(.cancelled) }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        guard status != .notDetermined, !waiting.isEmpty else { return }
        let replies = waiting; waiting.removeAll()
        if status == .authorizedAlways || status == .authorizedWhenInUse {
            manager.startUpdatingLocation()
            replies.forEach { $0.resolve(nil) }
        } else {
            replies.forEach { $0.reject("permission_denied", "Location permission is required") }
        }
    }
    public func locationManager(_: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations {
            onLocation?(["latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude, "accuracy": max(location.horizontalAccuracy, 0),
                         "bearing": location.course >= 0 ? location.course : nil, "speed": location.speed >= 0 ? location.speed : nil])
        }
    }
}
