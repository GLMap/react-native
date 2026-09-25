import GLMap
import ExpoModulesCore
import GLMapCore

/// Benchmark-only timings. Uses the same public builder and update result as the wrapper.
final class MapBenchmark {
    private let map: GLMapView
    private let layer = GLMapVectorLayer(drawOrder: 3)
    private let styles = ["#E74C3C", "#2650D6"].map { GLMapVectorCascadeStyle.createStyle("line{width:4pt;color:\($0);}")! }
    private var objects: GLMapVectorObjectArray?
    private var inputs: [Int: [Double]] = [:]
    private var revision = 0
    private var ready: [Double] = [0, 0, 0]
    init(_ map: GLMapView) { self.map = map; map.add(layer) }
    private func now() -> UInt64 { precondition(Thread.isMainThread); return DispatchTime.now().uptimeNanoseconds }
    private func micros(_ start: UInt64) -> Double { Double(now() - start) / 1000 }
    func echo(_ sequence: Int) -> Int { _ = now(); return sequence }
    func payload(_ values: [Double]) -> [Double] {
        let start = now(); let sum = values.reduce(0, +)
        return [sum, micros(start), 0, 0]
    }
    func native(_ count: Int) throws -> [Double] {
        precondition([1000, 10000, 100000].contains(count))
        if inputs[count] == nil {
            inputs[count] = (0..<count).flatMap { i -> [Double] in
                let t = Double(i) / Double(count - 1)
                return [13 + t * 6, 49 + sin(t * .pi * 8) * 0.2]
            }
        }
        return try geometry(inputs[count]!)
    }
    // Copy into the public SDK input representation; include this copy in the handler timer.
    private func doubles(_ buffer: NativeArrayBuffer) throws -> [Double] {
        guard buffer.byteLength % 8 == 0 else { throw error("invalid_buffer_length") }
        return buffer.withUnsafeBytes { bytes in
            (0..<(bytes.count / 8)).map { bytes.loadUnaligned(fromByteOffset: $0 * 8, as: Double.self) }
        }
    }
    func payloadBuffer(_ buffer: NativeArrayBuffer) throws -> [Double] {
        let start = now(); let sum = try doubles(buffer).reduce(0, +)
        return [sum, micros(start), 0, 0]
    }
    func geometryBuffer(_ buffer: NativeArrayBuffer) throws -> [Double] {
        let start = now()
        return try geometry(doubles(buffer), start: start)
    }
    func geometry(_ values: [Double], start suppliedStart: UInt64? = nil) throws -> [Double] {
        let start = suppliedStart ?? now()
        guard values.count >= 4, values.count % 2 == 0 else { throw error("invalid_geometry") }
        for i in stride(from: 0, to: values.count, by: 2) {
            guard values[i].isFinite, values[i+1].isFinite,
                  (-180...180).contains(values[i]), (-90...90).contains(values[i+1]) else { throw error("invalid_geometry") }
        }
        let builder = GeometryBuilder()
        builder.addLine(UInt(values.count / 2)) { i in
            GLMapPoint(lat: values[Int(i)*2+1], lon: values[Int(i)*2])
        }
        guard let object = builder.build() else { throw error("empty_geometry") }
        let next = GLMapVectorObjectArray(); next.add(object); objects = next
        let construction = micros(start)
        submit(start, false)
        return [Double(next.count), micros(start), Double(revision), construction]
    }
    func restyle(_ alternate: Bool) throws -> [Double] {
        let start = now()
        guard objects != nil else { throw error("missing_geometry") }
        submit(start, alternate)
        return [Double(objects!.count), micros(start), Double(revision), 0]
    }
    private func submit(_ start: UInt64, _ alternate: Bool) {
        revision += 1; let current = revision
        layer.setVectorObjects(objects!, with: styles[alternate ? 1 : 0], completion: { [weak self] result in
            guard let self else { return }
            self.ready = [Double(current), self.micros(start), result == .ready ? 1 : -1]
        })
    }
    func status() -> [Double] { _ = now(); return ready }
    func readback() throws -> String {
        guard let objects, objects.count == 1 else { throw error("missing_geometry") }
        return objects.object(at: 0).asGeoJSON()
    }
    func dispose() { map.remove(layer); objects = nil; inputs.removeAll() }
    private func error(_ message: String) -> NSError { NSError(domain: "GLMapBenchmark", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
