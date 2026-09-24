import ExpoModulesCore
import GLMap
import GLMapCore
import GLMapSwift

struct CameraRecord: Record {
    @Field var latitude: Double = 0
    @Field var longitude: Double = 0
    @Field var zoom: Double = 5
    @Field var angle: Double = 0
    @Field var pitch: Double = 0
}

public final class GLMapLabModule: Module {
    public func definition() -> ModuleDefinition {
        Name("GLMapLab")
        AsyncFunction("saveBenchmarkResults") { (json: String) -> String in
            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("react-native-benchmark.json")
            try json.write(to: url, atomically: true, encoding: .utf8)
            return url.path
        }
        AsyncFunction("saveResults") { (json: String) -> String in
            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("react-native-results.json")
            try json.write(to: url, atomically: true, encoding: .utf8)
            return url.path
        }
        View(GLMapLabView.self) {
            Events("onReady", "onMapTap", "onFailure")
            Prop("fixture") { (view: GLMapLabView, source: String) in view.configure(source) }
            AsyncFunction("captureState") { (view: GLMapLabView, promise: Promise) in try view.capture(promise) }
            AsyncFunction("setCamera") { (view: GLMapLabView, camera: CameraRecord) in try view.camera(camera) }
            AsyncFunction("createVectorLayer") { (view: GLMapLabView, order: Int, promise: Promise) in try view.createLayer(order, promise) }
            AsyncFunction("mutateVectorLayer") { (view: GLMapLabView, id: Int, operation: String, coordinates: [Double]?, json: String?, style: String?, promise: Promise) in
                try view.mutate(id, operation, coordinates, json, style, promise)
            }
            AsyncFunction("diagnostics") { (view: GLMapLabView) in try view.diagnostics() }
            AsyncFunction("benchEcho") { (view: GLMapLabView, sequence: Int) in try view.bench().echo(sequence) }
            AsyncFunction("benchPayload") { (view: GLMapLabView, values: [Double]) in try view.bench().payload(values) }
            AsyncFunction("benchGeometry") { (view: GLMapLabView, values: [Double]) in try view.bench().geometry(values) }
            AsyncFunction("benchPayloadBuffer") { (view: GLMapLabView, values: NativeArrayBuffer) in try view.bench().payloadBuffer(values) }
            AsyncFunction("benchGeometryBuffer") { (view: GLMapLabView, values: NativeArrayBuffer) in try view.bench().geometryBuffer(values) }
            AsyncFunction("benchNative") { (view: GLMapLabView, count: Int) in try view.bench().native(count) }
            AsyncFunction("benchRestyle") { (view: GLMapLabView, alternate: Bool) in try view.bench().restyle(alternate) }
            AsyncFunction("benchStatus") { (view: GLMapLabView) in try view.bench().status() }
            AsyncFunction("benchReadback") { (view: GLMapLabView) in try view.bench().readback() }
            AsyncFunction("dispose") { (view: GLMapLabView) in view.dispose() }
        }
    }
}

final class GLMapLabView: ExpoView {
    private static let activate: Bool = GLMapManager.activate(apiKey: "")
    private let map: GLMapView
    private let marker = GLMapImage(drawOrder: 2)
    private let fixtureLayer = GLMapVectorLayer(drawOrder: 1)
    let onReady = EventDispatcher()
    let onMapTap = EventDispatcher()
    let onFailure = EventDispatcher()
    private var configured = false
    private var disposed = false
    private var readySent = false
    private var nextRequest = 0
    private var pending: [Int: Promise] = [:]
    private var nextLayer = 0
    private var taps = 0
    private var moves = 0
    private final class Layer {
        let native: GLMapVectorLayer
        var objects: GLMapVectorObjectArray?
        init(_ order: Int32) { native = GLMapVectorLayer(drawOrder: order) }
    }
    private var layers: [Int: Layer] = [:]
    private var benchmark: LabBenchmark?
    func bench() throws -> LabBenchmark {
        try checkOpen()
        if benchmark == nil { benchmark = LabBenchmark(map) }
        return benchmark!
    }

    required init(appContext: AppContext? = nil) {
        _ = GLMapLabView.activate
        map = GLMapView(frame: .zero)
        super.init(appContext: appContext)
        clipsToBounds = true
        addSubview(map)
        map.accessibilityIdentifier = "GLMap canvas"
        map.tapGestureBlock = { [weak self] gesture in
            guard let self, !self.disposed else { return }
            let point = gesture.location(in: self.map)
            self.taps += 1
            self.onMapTap(["x": point.x, "y": point.y, "count": self.taps])
        }
        map.mapDidMoveBlock = { [weak self] _ in self?.moves += 1 }
    }
    override func layoutSubviews() {
        super.layoutSubviews()
        map.frame = bounds
        reportReady()
    }
    override func didMoveToWindow() { super.didMoveToWindow(); reportReady() }
    private func reportReady() {
        if configured && !disposed && !readySent && window != nil && bounds.width > 0 && bounds.height > 0 {
            readySent = true
            onReady(["surfaceAvailable": true])
        }
    }
    private func checkOpen() throws { if disposed { throw failure("map_disposed") } }
    private func failure(_ message: String) -> NSError { NSError(domain: "GLMapLab", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    private func retain(_ promise: Promise) -> Int { nextRequest += 1; pending[nextRequest] = promise; return nextRequest }
    private func settle(_ id: Int, _ value: Any) { pending.removeValue(forKey: id)?.resolve(value) }

    func configure(_ source: String) {
        if configured || disposed { return }
        do {
            guard let fixture = try JSONSerialization.jsonObject(with: Data(source.utf8)) as? [String: Any],
                  let camera = fixture["camera"] as? [String: Double], let markerPoint = fixture["marker"] as? [String: Double],
                  let track = fixture["track"], let path = GLMapManager.shared.resourcesBundle.path(forResource: "DefaultStyle", ofType: "bundle") else { throw failure("Missing fixture/resources") }
            let parser = GLMapStyleParser(paths: [path])
            map.setStyle(try parser.parseFromResources())
            map.reloadTiles()
            map.mapGeoCenter = GLMapGeoPoint(lat: camera["latitude"]!, lon: camera["longitude"]!)
            map.mapZoomLevel = camera["zoom"]!
            let json = String(decoding: try JSONSerialization.data(withJSONObject: track), as: UTF8.self)
            let objects = try GLMapVectorObject.createVectorObjects(fromGeoJSON: json)
            let style = GLMapVectorCascadeStyle.createStyle("line{width:4pt;color:#E74C3C;}")!
            fixtureLayer.setVectorObjects(objects, with: style, completion: nil)
            map.add(fixtureLayer)
            let image = UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { context in
                UIColor.white.setFill(); context.cgContext.fillEllipse(in: CGRect(x: 0, y: 0, width: 24, height: 24))
                UIColor(red: 38/255, green: 80/255, blue: 214/255, alpha: 1).setFill()
                context.cgContext.fillEllipse(in: CGRect(x: 3, y: 3, width: 18, height: 18))
            }
            marker.setImage(image, completion: nil)
            marker.position = GLMapPoint(lat: markerPoint["latitude"]!, lon: markerPoint["longitude"]!)
            marker.offset = CGPoint(x: 12, y: 12)
            map.add(marker)
            configured = true
            reportReady()
        } catch { onFailure(["message": error.localizedDescription]) }
    }
    func camera(_ value: CameraRecord) throws {
        try checkOpen()
        guard [value.latitude,value.longitude,value.zoom,value.angle,value.pitch].allSatisfy({ $0.isFinite }),
              (-90...90).contains(value.latitude), (-180...180).contains(value.longitude), (0...45).contains(value.pitch), Float(value.angle).isFinite else { throw failure("invalid_camera") }
        map.mapGeoCenter = GLMapGeoPoint(lat: value.latitude, lon: value.longitude)
        map.mapZoomLevel = value.zoom; map.mapAngle = Float(value.angle); map.mapPitch = Float(value.pitch)
    }
    func capture(_ promise: Promise) throws {
        try checkOpen()
        guard window != nil else { throw failure("map_unavailable") }
        let id = retain(promise)
        map.captureState { [weak self] state in
            let c = state.geoCenter
            self?.settle(id, ["latitude": c.lat, "longitude": c.lon, "zoom": state.zoom, "scale": state.scale,
                "angle": Double(state.angle), "pitch": Double(state.pitch), "originX": state.origin.x, "originY": state.origin.y])
        }
    }
    func createLayer(_ order: Int, _ promise: Promise) throws {
        try checkOpen()
        guard let order = Int32(exactly: order) else { throw failure("invalid_draw_order") }
        let entry = Layer(order); nextLayer += 1; layers[nextLayer] = entry
        map.add(entry.native); promise.resolve(nextLayer)
    }
    func mutate(_ id: Int, _ operation: String, _ coordinates: [Double]?, _ json: String?, _ source: String?, _ promise: Promise) throws {
        try checkOpen()
        guard let entry = layers[id] else { throw failure("layer_removed") }
        if operation == "remove" { layers.removeValue(forKey: id); map.remove(entry.native); promise.resolve("removed"); return }
        guard operation == "replace" || operation == "style", let source else { throw failure("invalid_mutation") }
        let parser = GLMapStyleParser(); try parser.parseNextString(source)
        let style = try parser.finish()
        let objects: GLMapVectorObjectArray
        if operation == "replace" { objects = try geometry(coordinates, json) }
        else { guard let previous = entry.objects else { throw failure("missing_geometry") }; objects = previous }
        let request = retain(promise)
        entry.native.setVectorObjects(objects, with: style, updateCompletion: { [weak self] outcome in
            let result: String
            switch outcome {
            case .ready: result = "ready"
            case .superseded: result = "superseded"
            case .cancelled: result = "cancelled"
            case .failed: result = "failed"
            @unknown default: result = "failed"
            }
            self?.settle(request, result)
        })
        entry.objects = objects
    }
    private func geometry(_ coordinates: [Double]?, _ json: String?) throws -> GLMapVectorObjectArray {
        guard (coordinates == nil) != (json == nil) else { throw failure("invalid_geometry") }
        if let json { return try GLMapVectorObject.createVectorObjects(fromGeoJSON: json) }
        let values = coordinates!
        guard values.count % 2 == 0, values.count != 2 else { throw failure("invalid_geometry") }
        for i in stride(from: 0, to: values.count, by: 2) {
            guard values[i].isFinite, values[i+1].isFinite, (-180...180).contains(values[i]), (-90...90).contains(values[i+1]) else { throw failure("invalid_geometry") }
        }
        let result = GLMapVectorObjectArray()
        if !values.isEmpty {
            let builder = GeometryBuilder()
            builder.addLine(UInt(values.count / 2), callback: { index in
                GLMapPoint(lat: values[Int(index)*2+1], lon: values[Int(index)*2])
            })
            guard let object = builder.build() else { throw failure("invalid_geometry") }
            result.add(object)
        }
        return result
    }
    func diagnostics() throws -> [String: Any] {
        try checkOpen()
        return ["surfaceAvailable": window != nil, "width": bounds.width, "height": bounds.height, "taps": taps, "moves": moves,
            "layers": layers.map { id, entry -> [String: Any] in
                ["id": id, "count": entry.objects?.count ?? 0,
                 "geoJson": entry.objects.flatMap { $0.count > 0 ? $0.object(at: 0).asGeoJSON() : nil } as Any? ?? NSNull()]
            }]
    }
    func dispose() {
        if disposed { return }
        disposed = true
        benchmark?.dispose(); benchmark = nil
        let replies = pending; pending.removeAll()
        replies.values.forEach { $0.reject("map_disposed", "The map has been removed") }
        map.tapGestureBlock = nil; map.mapDidMoveBlock = nil
        layers.values.forEach { map.remove($0.native) }; layers.removeAll()
        map.remove(marker); map.remove(fixtureLayer)
        map.removeFromSuperview()
    }
    deinit { dispose() }
}
