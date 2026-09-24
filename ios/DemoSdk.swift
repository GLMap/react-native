import ExpoModulesCore
import GLMap
import GLMapCore
import GLMapSwift
import GLRoute
import GLSearch

struct DemoFailure: Error {
    let code: String
    let message: String
    static let cancelled = DemoFailure(code: "cancelled", message: "Request was cancelled")
    static let disposed = DemoFailure(code: "disposed", message: "The native owner has been released")
    static func invalid(_ message: String) -> DemoFailure { DemoFailure(code: "invalid_argument", message: message) }
    static func notFound(_ message: String) -> DemoFailure { DemoFailure(code: "not_found", message: message) }
    static func sdk(_ message: String) -> DemoFailure { DemoFailure(code: "sdk_error", message: message) }
    init(code: String, message: String) { self.code = code; self.message = message }
    init(_ error: Error) {
        if let failure = error as? DemoFailure { self = failure; return }
        let native = error as NSError
        if native.code == Int(ECANCELED), native.domain == "ERRNO" || native.domain == NSPOSIXErrorDomain { self = .cancelled; return }
        self.init(code: "sdk_error", message: "\(native.domain) \(native.code): \(native.localizedDescription)")
    }
}

extension Promise {
    func reject(_ failure: DemoFailure) { reject(failure.code, failure.message) }
    func settle(_ body: () throws -> Any?) {
        do { resolve(try body()) } catch { reject(DemoFailure(error)) }
    }
}

enum DemoAssets {
    static let bundle = Bundle.main.url(forResource: "GLMapLabAssets", withExtension: "bundle").flatMap { Bundle(url: $0) }
    static func path(_ name: String) throws -> String {
        guard !name.contains("/"), let path = bundle?.path(forResource: name, ofType: nil) else { throw DemoFailure.notFound("Asset \(name) is not bundled") }
        return path
    }
}

extension DemoGeoRecord {
    var native: GLMapGeoPoint { GLMapGeoPoint(lat: latitude, lon: longitude) }
    var isValid: Bool { (-90...90).contains(latitude) && (-180...180).contains(longitude) }
}
extension DemoBoundsRecord {
    var native: GLMapBBox {
        var box = GLMapBBox.empty
        box.add(point: GLMapPoint(lat: south, lon: west)); box.add(point: GLMapPoint(lat: north, lon: east))
        return box
    }
    var isValid: Bool { (-90...90).contains(south) && (-90...90).contains(north) && (-180...180).contains(west) && (-180...180).contains(east) && south <= north && west <= east }
}
extension GLMapBBox {
    var record: [String: Any]? {
        guard !isEmpty else { return nil }
        let a = GLMapGeoPoint(point: origin), b = GLMapGeoPoint(point: GLMapPoint(x: origin.x + size.x, y: origin.y + size.y))
        return ["south": min(a.lat, b.lat), "west": min(a.lon, b.lon), "north": max(a.lat, b.lat), "east": max(a.lon, b.lon)]
    }
}
func dataSet(_ name: String) throws -> GLMapInfoDataSet {
    switch name {
    case "map": return .map
    case "navigation": return .navigation
    case "elevation": return .elevation
    default: throw DemoFailure.invalid("Unknown data set \(name)")
    }
}

/// SDK services shared by the module and its map views. Main queue only.
final class DemoSdk {
    private final class Request {
        let promise: Promise
        var cancel: () -> Void = {}
        init(_ promise: Promise) { self.promise = promise }
    }
    static let shared = DemoSdk()
    private weak var owner: AnyObject?
    private var emit: ((String, [String: Any?]) -> Void)?
    private var activated = false
    private var observers: [NSObjectProtocol] = []
    private var requests: [Int: Request] = [:]
    private(set) var routes: [Int: GLRoute] = [:]
    private var trackers: [Int: GLRouteTracker] = [:]
    private var lastRoute = 0
    private lazy var locale = GLMapLocaleSettings(localesOrder: ["en", "native"], unitSystem: .international)
    let location = DemoLocation()

    func attach(_ owner: AnyObject, _ emit: @escaping (String, [String: Any?]) -> Void) {
        if self.owner !== owner { resetSession() }
        self.owner = owner
        self.emit = emit
        location.onLocation = { [weak self] in self?.emit?("onLocation", $0) }
        let center = NotificationCenter.default
        for name in [GLMapInfo.stateChanged, GLMapDownloadTask.downloadTaskStarted, GLMapDownloadTask.downloadFinished] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in self?.emit?("onRegionsChanged", [:]) })
        }
        observers.append(center.addObserver(forName: GLMapDownloadTask.downloadProgress, object: nil, queue: .main) { [weak self] note in
            guard let task = note.object as? GLMapDownloadTask else { return }
            self?.emit?("onRegionProgress", ["id": String(task.map.mapID), "downloaded": Int(task.downloaded), "total": Int(task.total)])
        })
    }
    /// A reloaded module may attach before its predecessor detaches.
    func detach(_ owner: AnyObject) {
        guard self.owner === owner else { return }
        resetSession()
    }
    private func resetSession() {
        self.owner = nil
        emit = nil
        observers.forEach(NotificationCenter.default.removeObserver); observers.removeAll()
        let open = requests; requests.removeAll()
        open.values.forEach { $0.cancel(); $0.promise.reject(.disposed) }
        location.stop()
        trackers.removeAll(); routes.removeAll()
    }

    func initialize(_ apiKey: String) throws {
        guard GLMapManager.activate(apiKey: apiKey) else { throw DemoFailure.sdk("GLMap initialization failed") }
        activated = true
    }
    /// A map view created before `initialize` still needs the SDK resources.
    func ensureActivated() { if !activated { activated = GLMapManager.activate(apiKey: "") } }
    func setTileDownloadingAllowed(_ allowed: Bool) { ensureActivated(); GLMapManager.shared.tileDownloadingAllowed = allowed }

    func addDataSet(_ asset: String, _ kind: String) throws {
        let kind = try dataSet(kind), path = try DemoAssets.path(asset)
        try register(kind, path, .empty)
    }
    private func register(_ kind: GLMapInfoDataSet, _ path: String, _ box: GLMapBBox) throws {
        // Adding a registered file again reports EEXIST.
        GLMapManager.shared.remove(kind, path: path)
        if let error = GLMapManager.shared.add(kind, path: path, bbox: box).nsError { throw DemoFailure(error) }
    }

    // MARK: Requests

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

    func search(_ id: Int, _ query: DemoSearchRecord, _ promise: Promise) {
        guard query.center.isValid, query.limit >= 0 else { promise.reject(.invalid("Invalid search query")); return }
        guard let entry = begin(id, promise) else { return }
        let request = GLSearchRequest(type: query.type == "autocomplete" ? .autocomplete : .search, text: query.text, center: query.center.native,
                                      limit: query.limit, locales: ["en", "native"], categories: query.categories)
        let completion: GLSearchResultsCompletionBlock = { [weak self] results, error in
            guard let self, let promise = finish(id, entry) else { return }
            if let error { promise.reject(DemoFailure(error)); return }
            promise.resolve((results?.array() ?? []).map(self.place))
        }
        let native = query.offline ? request.startOffline(completion: completion) : request.startOnline(completion: completion)
        if requests[id] === entry { entry.cancel = { GLSearchRequest.cancel(native) } }
    }
    private func place(_ object: GLMapVectorObject) -> [String: Any] {
        let name = object.localizedName(locale)
        var highlights: [Int] = []
        let mark = NSAttributedString.Key("GLMapDemoHighlight")
        if let text = name?.asAttributedString([:], highlight: [mark: true]) {
            text.enumerateAttribute(mark, in: NSRange(location: 0, length: text.length)) { value, range, _ in
                if value != nil { highlights += [range.location, range.location + range.length] }
            }
        }
        let point = GLMapGeoPoint(point: object.point)
        return ["name": name?.asString() ?? "Unnamed", "nameHighlights": highlights, "detail": object.searchSecondaryText?.asString() ?? "",
                "latitude": point.lat, "longitude": point.lon]
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
        lastRoute += 1; routes[lastRoute] = route
        return ["id": lastRoute, "distance": route.length, "duration": route.duration, "bounds": route.bbox.record, "maneuverCount": route.allManeuvers.count]
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
    func releaseRoute(_ id: Int) { trackers.removeValue(forKey: id); routes.removeValue(forKey: id) }

    // MARK: Regions

    private func region(_ id: String) throws -> GLMapInfo {
        guard let key = Int64(id), let info = GLMapManager.shared.cachedMaps()?[NSNumber(value: key)] else { throw DemoFailure.notFound("Region \(id) is unavailable") }
        return info
    }
    private func onDevice(_ info: GLMapInfo) -> Bool { info.dataSets(with: .notDownloaded) != .all || info.subMaps.contains(where: onDevice) }
    private func record(_ info: GLMapInfo) -> [String: Any?] {
        let task = GLMapManager.shared.downloadTasks(forMap: info, dataSets: .all)?.first
        return ["id": String(info.mapID), "name": info.name(inLanguage: "en") ?? info.name(), "isCollection": !info.subMaps.isEmpty, "onDevice": onDevice(info),
                "downloaded": !info.dataSets(with: .downloaded).isEmpty, "sizeOnServer": Double(info.sizeOnServer(forDataSets: .all)),
                "sizeOnDisk": Double(info.sizeOnDisk(forDataSets: .all)), "progress": task.map { ["downloaded": Int($0.downloaded), "total": Int($0.total)] }]
    }
    func regions(_ parent: String?, _ refresh: Bool, _ promise: Promise) {
        let read = { [self] in promise.settle { try (parent.map { try region($0).subMaps } ?? GLMapManager.shared.cachedMapList() ?? []).map(record) } }
        if refresh { GLMapManager.shared.updateMapList { _, _, error in if let error { promise.reject(DemoFailure(error)) } else { read() } } } else { read() }
    }
    func downloadRegion(_ id: String) throws { GLMapManager.shared.downloadDataSets(.all, forMap: try region(id), withCompletionBlock: nil) }
    func cancelRegionDownload(_ id: String) throws { GLMapManager.shared.downloadTasks(forMap: try region(id), dataSets: .all)?.forEach { $0.cancel() } }
    func deleteRegion(_ id: String) throws { GLMapManager.shared.deleteDataSets(.all, forMap: try region(id)) }

    // MARK: Area downloads

    func downloadArea(_ id: Int, _ bounds: DemoBoundsRecord, _ files: [DemoAreaFileRecord], _ promise: Promise) {
        let kinds: [GLMapInfoDataSet]
        do { kinds = try files.map { try dataSet($0.dataSet) } } catch { promise.reject(DemoFailure(error)); return }
        guard bounds.isValid, !files.isEmpty, files.allSatisfy({ !$0.fileName.isEmpty && !$0.fileName.contains("/") }) else { promise.reject(.invalid("Invalid area request")); return }
        guard let entry = begin(id, promise) else { return }
        let box = bounds.native, manager = GLMapManager.shared, storage = FileManager.default
        let directory = storage.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        var tasks: [Int64] = [], remaining = files.count, failure: DemoFailure?
        entry.cancel = { tasks.forEach(manager.cancelDownload) }
        let finished: (DemoFailure?) -> Void = { [weak self] error in
            if failure == nil { failure = error }
            remaining -= 1
            guard remaining == 0, let promise = self?.finish(id, entry) else { return }
            if let failure { promise.reject(failure) } else { promise.resolve(nil) }
        }
        let install: (GLMapInfoDataSet, URL) -> DemoFailure? = { [self] kind, file in
            do { try register(kind, file.path, box); return nil } catch { try? storage.removeItem(at: file); return DemoFailure(error) }
        }
        for (index, file) in files.enumerated() {
            let kind = kinds[index], target = directory.appendingPathComponent(file.fileName)
            if storage.fileExists(atPath: target.path) { finished(install(kind, target)); continue }
            let partial = target.appendingPathExtension("\(UUID().uuidString).part")
            var task: Int64 = 0
            task = manager.downloadDataSet(kind, path: partial.path, bbox: box, progress: { [weak self] total, downloaded, _ in
                DispatchQueue.main.async {
                    guard let self, self.requests[id] === entry else { return }
                    self.emit?("onAreaProgress", ["requestId": id, "dataSet": file.dataSet, "downloaded": Int(downloaded), "total": Int(total)])
                }
            }, completion: { error in
                guard let index = tasks.firstIndex(of: task) else { return }
                tasks.remove(at: index)
                defer { try? storage.removeItem(at: partial) }
                guard self.requests[id] === entry else { return }
                var result = error.map { DemoFailure($0) }
                if result == nil {
                    do {
                        if !storage.fileExists(atPath: target.path) { try storage.moveItem(at: partial, to: target) }
                        result = install(kind, target)
                    } catch { result = DemoFailure(error) }
                }
                finished(result)
            })
            if task == 0 {
                try? storage.removeItem(at: partial)
                finished(.sdk("Cannot start download of \(file.fileName)"))
            } else { tasks.append(task) }
        }
    }
}

/// Copies a packed JS view into SDK-owned input; the caller may reuse it after the promise resolves.
extension NativeArrayBuffer {
    func demoDoubles(stride: Int = 2) throws -> [Double] {
        guard byteLength % 8 == 0 else { throw DemoFailure.invalid("Expected packed doubles") }
        let values = withUnsafeBytes { bytes in
            (0..<(bytes.count / 8)).map { bytes.loadUnaligned(fromByteOffset: $0 * 8, as: Double.self) }
        }
        guard values.count % stride == 0, values.allSatisfy(\.isFinite),
              Swift.stride(from: 0, to: values.count, by: stride).allSatisfy({ (-180...180).contains(values[$0]) && (-90...90).contains(values[$0 + 1]) })
        else { throw DemoFailure.invalid("Invalid longitude/latitude coordinates") }
        return values
    }
}

extension NativeArrayBuffer {
    func demoLines(_ counts: [Int]) throws -> [[Double]] {
        let values = try demoDoubles()
        if counts == [values.count], values.count >= 4 { return [values] }
        var offset = 0
        var lines: [[Double]] = []
        for count in counts {
            guard count >= 4, count % 2 == 0, count <= values.count - offset else { throw DemoFailure.invalid("Invalid line lengths") }
            lines.append(Array(values[offset..<(offset + count)]))
            offset += count
        }
        guard offset == values.count, !lines.isEmpty else { throw DemoFailure.invalid("Invalid line lengths") }
        return lines
    }
}
