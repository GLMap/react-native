import ExpoModulesCore
import GLMapCore
@_exported import GLMapCoreSwift

public struct DemoFailure: Error {
    public let code: String
    public let message: String
    public static let cancelled = DemoFailure(code: "cancelled", message: "Request was cancelled")
    public static let disposed = DemoFailure(code: "disposed", message: "The native owner has been released")
    public static func invalid(_ message: String) -> DemoFailure { DemoFailure(code: "invalid_argument", message: message) }
    public static func notFound(_ message: String) -> DemoFailure { DemoFailure(code: "not_found", message: message) }
    public static func sdk(_ message: String) -> DemoFailure { DemoFailure(code: "sdk_error", message: message) }
    public init(code: String, message: String) { self.code = code; self.message = message }
    public init(_ error: Error) {
        if let failure = error as? DemoFailure { self = failure; return }
        let native = error as NSError
        if native.code == Int(ECANCELED), native.domain == "ERRNO" || native.domain == NSPOSIXErrorDomain { self = .cancelled; return }
        self.init(code: "sdk_error", message: "\(native.domain) \(native.code): \(native.localizedDescription)")
    }
}

public extension Promise {
    func reject(_ failure: DemoFailure) { reject(failure.code, failure.message) }
    func settle(_ body: () throws -> Any?) {
        do { resolve(try body()) } catch { reject(DemoFailure(error)) }
    }
}

public enum DemoAssets {
    private static var bundles:[Bundle]=[]
    public static func register(_ bundle:Bundle?) { if let bundle, !bundles.contains(where: { $0.bundleURL==bundle.bundleURL }) { bundles.append(bundle) } }
    public static var searchPaths:[String] { ([Bundle.main]+bundles).map(\.bundlePath) }
    public static func path(_ name:String)throws->String {
        guard !name.contains("/") else { throw DemoFailure.notFound("Invalid asset name") }
        for bundle in [Bundle.main]+bundles { if let path=bundle.path(forResource:name,ofType:nil) { return path } }
        throw DemoFailure.notFound("Asset \(name) is not bundled")
    }
}

public extension DemoGeoRecord {
    var native: GLMapGeoPoint { GLMapGeoPoint(lat: latitude, lon: longitude) }
    var isValid: Bool { (-90...90).contains(latitude) && (-180...180).contains(longitude) }
}
public extension DemoBoundsRecord {
    var native: GLMapBBox {
        var box = GLMapBBox.empty
        box.add(point: GLMapPoint(lat: south, lon: west)); box.add(point: GLMapPoint(lat: north, lon: east))
        return box
    }
    var isValid: Bool { (-90...90).contains(south) && (-90...90).contains(north) && (-180...180).contains(west) && (-180...180).contains(east) && south <= north && west <= east }
}
public extension GLMapBBox {
    var record: [String: Any]? {
        guard !isEmpty else { return nil }
        let a = GLMapGeoPoint(point: origin), b = GLMapGeoPoint(point: GLMapPoint(x: origin.x + size.x, y: origin.y + size.y))
        return ["south": min(a.lat, b.lat), "west": min(a.lon, b.lon), "north": max(a.lat, b.lat), "east": max(a.lon, b.lon)]
    }
}
public func dataSet(_ name: String) throws -> GLMapInfoDataSet {
    switch name {
    case "map": return .map
    case "navigation": return .navigation
    case "elevation": return .elevation
    default: throw DemoFailure.invalid("Unknown data set \(name)")
    }
}


/// Copies a packed JS view into SDK-owned input; the caller may reuse it after the promise resolves.
public extension NativeArrayBuffer {
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

public extension NativeArrayBuffer {
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
