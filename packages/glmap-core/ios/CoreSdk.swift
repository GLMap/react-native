import ExpoModulesCore
import GLMapCore
import GLMapCoreSwift
/// SDK services shared by the module and its map views. Main queue only.
public final class CoreSdk {
    private final class Request {
        let promise: Promise
        var cancel: () -> Void = {}
        init(_ promise: Promise) { self.promise = promise }
    }
    public static let shared = CoreSdk()
    private weak var owner: AnyObject?
    private var emit: ((String, [String: Any?]) -> Void)?
    private var activated = false
    private var observers: [NSObjectProtocol] = []
    private var requests: [Int: Request] = [:]
    private lazy var locale = GLMapLocaleSettings(localesOrder: ["en", "native"], unitSystem: .international)
    public let location = DemoLocation()

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
        CoreResources.clear()
        self.owner = nil
        emit = nil
        observers.forEach(NotificationCenter.default.removeObserver); observers.removeAll()
        let open = requests; requests.removeAll()
        open.values.forEach { $0.cancel(); $0.promise.reject(.disposed) }
        location.stop()
    }

    func initialize(_ apiKey: String) throws {
        guard GLMapManager.activate(apiKey: apiKey) else { throw DemoFailure.sdk("GLMap initialization failed") }
        activated = true
    }
    /// A map view created before `initialize` still needs the SDK resources.
    public func ensureActivated() { if !activated { activated = GLMapManager.activate(apiKey: "") } }
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
