import ExpoModulesCore
import GlobusMapCore
import GLMapCore
import GLRoute
final class RouteSdk {
    private final class Request {
        let promise:Promise; var cancel:()->Void={}
        init(_ promise:Promise) { self.promise=promise }
    }
    static let shared=RouteSdk()
    private var requests:[Int:Request]=[:]
    private var routes:[Int:GLRoute]=[:]
    private var trackers:[Int:GLRouteTracker]=[:]
    private func begin(_ id: Int, _ promise: Promise) -> Request? {
        guard requests[id] == nil else { promise.reject(.invalid("Request \(id) is already running")); return nil }
        let entry = Request(promise)
        requests[id] = entry
        return entry
    }
    private func finish(_ id: Int, _ entry: Request) -> Promise? {
        guard requests[id] === entry else { return nil }
        return requests.removeValue(forKey: id)?.promise
    }
    func cancelRequest(_ id: Int) {
        guard let request = requests.removeValue(forKey: id) else { return }
        request.cancel()
        request.promise.reject(.cancelled)
    }

    func route(_ id: Int, _ query: DemoRouteQueryRecord, _ promise: Promise) {
        guard query.points.count >= 2, query.points.allSatisfy(\.isValid) else { promise.reject(.invalid("A route needs two valid points")); return }
        let request = GLRouteRequest()
        switch query.mode {
        case "car": request.setAutoWithOptions(.default)
        case "bicycle": request.setBicycleWithOptions(.default)
        case "pedestrian": request.setPedestrianWithOptions(.default)
        default: promise.reject(.invalid("Unknown route mode \(query.mode)")); return
        }
        request.locale = "en-US"
        request.unitSystem = .international
        query.points.forEach { request.add(GLRoutePoint(pt: $0.native, heading: .nan, type: .break)) }
        var config: String?
        if query.offline {
            do { config = try String(contentsOfFile: DemoAssets.path("valhalla.json"), encoding: .utf8) } catch { promise.reject(DemoFailure(error)); return }
        }
        guard let entry = begin(id, promise) else { return }
        let completion: GLRouteRequestCompletionBlock = { [weak self] route, error in
            guard let self, let promise = finish(id, entry) else { return }
            if let route { promise.resolve(store(route)) } else { promise.reject(error.map { DemoFailure($0) } ?? .sdk("No route returned")) }
        }
        let native = query.offline ? request.startOffline(withConfig: config, completion: completion) : request.startOnline(completion: completion)
        if requests[id] === entry { entry.cancel = { GLRouteRequest.cancel(native) } }
    }
    private func store(_ route: GLRoute) -> [String: Any?] {
        let id=CoreResources.addTrack(data:{ color in route.trackData(with:color) },line:{ index in
            let values=route.allManeuvers
            guard values.indices.contains(index) else { throw DemoFailure.notFound("Maneuver unavailable") }
            return NativeLine(line:values[index].line,index:values[index].lineStartIndex)
        });routes[id]=route
        return ["id": id, "distance": route.length, "duration": route.duration, "bounds": route.bbox.record, "maneuverCount": route.allManeuvers.count]
    }
    func buildRoute(_ steps: [DemoRouteStepRecord], _ buffer: NativeArrayBuffer, _ counts: [Int]) throws -> [String: Any?] {
        let coordinates = try buffer.demoLines(counts)
        guard coordinates.count == steps.count else { throw DemoFailure.invalid("One line per route step is required") }
        guard !steps.isEmpty, coordinates.allSatisfy({ $0.count >= 4 && $0.count % 2 == 0 && $0.allSatisfy(\.isFinite) }) && steps.allSatisfy({ $0.duration.isFinite && $0.duration >= 0 })
        else { throw DemoFailure.invalid("Every route step needs two points and a duration") }
        let turns: [String: GLManeuverType] = ["continue": .continue, "left": .left, "right": .right]
        let builder = GLRouteBuilder()
        builder.setLanguage("en")
        let first = coordinates.first!, last = coordinates.last!
        var finish = GLMapPoint(lat: last[last.count - 1], lon: last[last.count - 2])
        builder.addTargetPoint(GLRoutePoint(pt: GLMapGeoPoint(lat: first[1], lon: first[0]), heading: .nan, type: .break))
        builder.addTargetPoint(GLRoutePoint(pt: GLMapGeoPoint(point: finish), heading: .nan, type: .break))
        for (step, line) in zip(steps, coordinates) {
            guard let turn = turns[step.turn] else { throw DemoFailure.invalid("Unknown turn \(step.turn)") }
            let points = stride(from: 0, to: line.count, by: 2).map { GLMapPoint(lat: line[$0 + 1], lon: line[$0]) }
            points.withUnsafeBufferPointer { builder.add(turn, points: $0.baseAddress!, heights: nil, numberOfPoints: UInt32($0.count)) }
            builder.setManeuverShortInstruction(step.instruction)
            builder.setManeuverTime(step.duration)
        }
        builder.add(.destination, points: &finish, heights: nil, numberOfPoints: 1)
        builder.setManeuverShortInstruction("Arrive at destination")
        guard let route = builder.build() else { throw DemoFailure.sdk("GLRouteBuilder returned no route") }
        return store(route)
    }
    func route(_ id: Int) throws -> GLRoute {
        guard let route = routes[id] else { throw DemoFailure.notFound("Route \(id) has been released") }
        return route
    }
    func routeCoordinates(_ id: Int) throws -> [Double] {
        var result: [Double] = []
        try route(id).enumPoints(from: 0) { point, _ in let geo = GLMapGeoPoint(point: point); result += [geo.lon, geo.lat] }
        return result
    }
    private func record(_ maneuver: GLRouteManeuver) -> [String: Any] {
        let start = GLMapGeoPoint(point: maneuver.startPoint)
        return ["index": Int(maneuver.index), "type": Int(maneuver.type.rawValue), "instruction": maneuver.shortInstruction ?? "", "latitude": start.lat, "longitude": start.lon]
    }
    func maneuver(_ id: Int, _ index: Int) throws -> [String: Any]? {
        let all = try route(id).allManeuvers
        return all.indices.contains(index) ? record(all[index]) : nil
    }
    func updateNavigation(_ id: Int, _ location: DemoLocationRecord) throws -> [String: Any?] {
        let route = try route(id)
        guard location.point.isValid else { throw DemoFailure.invalid("Invalid location") }
        if trackers[id] == nil {
            guard let tracker = GLRouteTracker(data: route) else { throw DemoFailure.sdk("Cannot track route \(id)") }
            tracker.currentTargetPointIndex = 1
            trackers[id] = tracker
        }
        let tracker = trackers[id]!
        let maneuver = tracker.updateLocation(location.point.native, userBearing: location.bearing.map { Float($0) } ?? .nan)
        let point = tracker.onRoute ? GLMapGeoPoint(point: tracker.locationOnRoute) : location.point.native
        return ["maneuver": maneuver.map(record), "distanceToManeuver": tracker.distanceToNextManeuver, "remainingDistance": tracker.remainingDistance,
                "remainingDuration": tracker.remainingDuration, "progress": tracker.progressIndex, "onRoute": tracker.onRoute,
                "latitude": point.lat, "longitude": point.lon]
    }
    func releaseRoute(_ id: Int) { CoreResources.removeTrack(id); trackers.removeValue(forKey: id); routes.removeValue(forKey: id) }

    func detach() { let waiting=requests;requests.removeAll();waiting.values.forEach { $0.cancel();$0.promise.reject(.disposed) }
        for id in routes.keys { CoreResources.removeTrack(id) };routes.removeAll();trackers.removeAll()
    }
}
