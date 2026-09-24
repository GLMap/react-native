import Foundation

typealias GLMapInfoDataSet = Int
struct GLMapBBox { static let empty = GLMapBBox() }
struct DemoBoundsRecord { let isValid = true; let native = GLMapBBox() }
struct DemoAreaFileRecord { let dataSet: String; let fileName: String }
func dataSet(_ name: String) throws -> GLMapInfoDataSet { 0 }
struct DemoFailure: Error {
    let code: String
    init(_ error: Error) { code = "sdk_error" }
    init(code: String) { self.code = code }
    static let cancelled = DemoFailure(code: "cancelled")
    static func sdk(_ message: String) -> Self { .init(code: "sdk_error") }
    static func invalid(_ message: String) -> Self { .init(code: "invalid_argument") }
}
final class Promise {
    var result: String?
    var settlements = 0
    func resolve(_ value: Any?) { result = "success"; settlements += 1 }
    func reject(_ error: DemoFailure) { result = error.code; settlements += 1 }
}
// Only the SDK callbacks and cache-directory lookup are doubled. File operations use Foundation.
final class Storage {
    let root = Foundation.FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    init() { try! Foundation.FileManager.default.createDirectory(at: root, withIntermediateDirectories: true) }
    func urls(for: Foundation.FileManager.SearchPathDirectory, in: Foundation.FileManager.SearchPathDomainMask) -> [URL] { [root] }
    func fileExists(atPath path: String) -> Bool { Foundation.FileManager.default.fileExists(atPath: path) }
    func removeItem(at url: URL) throws { try Foundation.FileManager.default.removeItem(at: url) }
    func moveItem(at from: URL, to: URL) throws { try Foundation.FileManager.default.moveItem(at: from, to: to) }
}
enum FileManager { static let `default` = Storage() }
final class GLMapManager {
    static let shared = GLMapManager()
    struct Task { let file: URL; let completion: (Error?) -> Void }
    var tasks: [Int64: Task] = [:]
    var next: Int64 = 0
    var failNextStart = false
    func downloadDataSet(_ kind: Int, path: String, bbox: GLMapBBox, progress: @escaping (Int, Int, Double) -> Void,
                         completion: @escaping (Error?) -> Void) -> Int64 {
        if failNextStart {
            failNextStart = false
            DispatchQueue.main.async { completion(DemoFailure.sdk("start failed")) }
            return 0
        }
        let url = URL(fileURLWithPath: path)
        try! "incomplete".write(to: url, atomically: false, encoding: .utf8)
        next += 1; tasks[next] = Task(file: url, completion: completion)
        return next
    }
    func cancelDownload(_ id: Int64) { /* Completion is deliberately delayed until complete(). */ }
    func complete(_ id: Int64, success: Bool) {
        let task = tasks.removeValue(forKey: id)!
        if success { try! "complete".write(to: task.file, atomically: false, encoding: .utf8) }
        task.completion(success ? nil : DemoFailure.cancelled)
    }
}
final class DemoSdk {
    /* RN_REQUEST */
    private var requests: [Int: Request] = [:]
    var emit: ((String, [String: Any?]) -> Void)?
    private func register(_ kind: GLMapInfoDataSet, _ path: String, _ box: GLMapBBox) throws {
        if try String(contentsOfFile: path, encoding: .utf8) != "complete" { throw DemoFailure.sdk("invalid file") }
    }
    /* RN_REQUESTS */
    /* RN_IOS */
}
let storage = FileManager.default
let manager = GLMapManager.shared
let sdk = DemoSdk()
defer { try? storage.removeItem(at: storage.root) }
for success in [false, true] {
    let name = "cancel-\(success).map"
    let files = [DemoAreaFileRecord(dataSet: "map", fileName: name)]
    let first = Promise()
    sdk.downloadArea(1, DemoBoundsRecord(), files, first)
    let old = manager.next
    sdk.cancelRequest(1)
    let second = Promise()
    sdk.downloadArea(1, DemoBoundsRecord(), files, second)
    let new = manager.next, partial = manager.tasks[new]!.file
    precondition(manager.tasks[old]!.file != partial)
    manager.complete(old, success: success)
    precondition(first.result == "cancelled" && first.settlements == 1)
    precondition(second.result == nil && storage.fileExists(atPath: partial.path))
    precondition(!storage.fileExists(atPath: storage.root.appendingPathComponent(name).path))
    manager.complete(new, success: true)
    precondition(second.result == "success" && second.settlements == 1)
    precondition(try! String(contentsOf: storage.root.appendingPathComponent(name), encoding: .utf8) == "complete")
    let cached = Promise(), before = manager.next
    sdk.downloadArea(2, DemoBoundsRecord(), files, cached)
    precondition(cached.result == "success" && manager.next == before)
}
manager.failNextStart = true
let failed = Promise()
sdk.downloadArea(3, DemoBoundsRecord(), [DemoAreaFileRecord(dataSet: "map", fileName: "failed.map")], failed)
RunLoop.current.run(until: Date().addingTimeInterval(0.01))
precondition(failed.result == "sdk_error" && failed.settlements == 1)
print("PASS RN iOS: cancelled late error/success cannot modify replacement, reused request ID, cache reuse, start failure")
