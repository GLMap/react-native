import CoreLocation
import ExpoModulesCore
import GLMap
import GLMapCore
import GLMapSwift
import GLRoute
import GLSearch

private final class DemoMarker: NSObject {
    let index: Int
    let point: GLMapPoint
    init(_ index: Int, _ point: GLMapPoint) { self.index = index; self.point = point }
}

private final class DemoPins: GLMapImageGroupDataSource {
    private let lock = NSRecursiveLock()
    private let variants: [UIImage]
    private var pins: [(position: GLMapPoint, variant: UInt32)] = []
    init(_ variants: [UIImage]) { self.variants = variants }
    func set(_ values: [(GLMapPoint, UInt32)]) { lock.lock(); pins = values.map { (position: $0.0, variant: $0.1) }; lock.unlock() }
    var variantCount: Int { variants.count }
    func startUpdate() { lock.lock() }
    func endUpdate() { lock.unlock() }
    func getVariantsCount() -> UInt32 { UInt32(variants.count) }
    func getVariant(_ index: UInt32, offset: UnsafeMutablePointer<CGPoint>) -> UIImage {
        let image = variants[Int(index)]
        offset.pointee = CGPoint(x: image.size.width / 2 * image.scale, y: 0)
        return image
    }
    func getImagesCount() -> UInt32 { UInt32(pins.count) }
    func getImageInfo(_ index: UInt32, variant: UnsafeMutablePointer<UInt32>, position: UnsafeMutablePointer<GLMapPoint>) {
        variant.pointee = pins[Int(index)].variant
        position.pointee = pins[Int(index)].position
    }
}

private final class DemoRasterSource: GLMapRasterTileSource {
    private let templates: [String]
    init?(_ record: DemoRasterRecord) {
        templates = record.urlTemplates
        let documents = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)[0]
        super.init(cachePath: (documents as NSString).appendingPathComponent(record.cacheName))
        validZoomMask = UInt32((1 << 20) - 1)
        attributionText = record.attribution
    }
    override func url(for pos: GLMapTilePos) -> URL? {
        let template = templates[Int(UInt32(bitPattern: pos.x &+ pos.y) % UInt32(templates.count))]
        return URL(string: template.replacingOccurrences(of: "{z}", with: String(pos.z)).replacingOccurrences(of: "{x}", with: String(pos.x))
            .replacingOccurrences(of: "{y}", with: String(pos.y)))
    }
}

private final class DemoDrawable {
    var objects: [GLMapDrawObject] = []
    var userLocation: GLMapUserLocation?
    var hidden = false
    var animation: GLMapAnimation?
    var style: GLMapVectorStyle?
    var trackData: GLMapTrackData?
    var pins: DemoPins?
    var markers: [DemoMarker] = []
    var vectorObjects: GLMapVectorObjectArray?
}

final class GLMapDemoView: ExpoView {
    let onMapReady = EventDispatcher()
    let onMapTap = EventDispatcher()
    let onMapLongPress = EventDispatcher()
    private let map: GLMapView
    private var disposed = false
    private var readySent = false
    private var visibleInsets = UIEdgeInsets.zero
    private var cameraAnimation: GLMapAnimation?
    private var drawables: [Int: DemoDrawable] = [:]
    private var lastDrawable = 0
    private var pending: [Int: Promise] = [:]
    private var lastPending = 0

    required init(appContext: AppContext? = nil) {
        DemoSdk.shared.ensureActivated()
        map = GLMapView(frame: .zero)
        super.init(appContext: appContext)
        clipsToBounds = true
        addSubview(map)
        map.visibleMapInsetsProvider = { [weak self] in self?.visibleInsets ?? .zero }
        map.tapGestureBlock = { [weak self] gesture in self?.touch(gesture, self?.onMapTap) }
        map.longPressGestureBlock = { [weak self] gesture in if gesture.state == .began { self?.touch(gesture, self?.onMapLongPress) } }
        try? setStyleOptions([:])
    }
    override func layoutSubviews() {
        super.layoutSubviews()
        map.frame = bounds
        reportReady()
    }
    override func didMoveToWindow() { super.didMoveToWindow(); reportReady() }
    private func reportReady() {
        if !disposed && !readySent && window != nil && bounds.width > 0 && bounds.height > 0 {
            readySent = true
            onMapReady([:])
        }
    }
    private func touch(_ gesture: UIGestureRecognizer, _ event: EventDispatcher?) {
        guard !disposed else { return }
        let point = gesture.location(in: map), geo = GLMapGeoPoint(point: map.makeMapPoint(fromDisplay: point))
        event?(["x": point.x, "y": point.y, "latitude": geo.lat, "longitude": geo.lon])
    }

    /// Settles `promise` with the result of `body`, or with `disposed` once the view is gone.
    func settle(_ promise: Promise, _ body: () throws -> Any?) {
        if disposed { promise.reject(.disposed) } else { promise.settle(body) }
    }
    private func retain(_ promise: Promise) -> Int { lastPending += 1; pending[lastPending] = promise; return lastPending }
    private func release(_ request: Int) -> Promise? { pending.removeValue(forKey: request) }

    // MARK: Map

    func setStyleOptions(_ options: [String: String]) throws {
        guard let path = GLMapManager.shared.resourcesBundle.path(forResource: "DefaultStyle", ofType: "bundle") else { throw DemoFailure.sdk("DefaultStyle.bundle is unavailable") }
        // The asset bundle resolves images referenced by drawable styles, e.g. fill-image.
        let parser = GLMapStyleParser(paths: [path] + [DemoAssets.bundle?.bundlePath].compactMap { $0 })
        parser.setOptions(options, defaultValue: true)
        map.setStyle(try parser.parseFromResources())
        map.reloadTiles()
    }
    func setTileSource(_ source: DemoRasterRecord?) throws {
        guard let source else { map.base = GLMapVectorTileSource(); return }
        guard !source.urlTemplates.isEmpty, !source.cacheName.isEmpty, !source.cacheName.contains("/"),
              source.urlTemplates.allSatisfy({ url in url.hasPrefix("https://") && ["{z}", "{x}", "{y}"].allSatisfy(url.contains) }),
              let raster = DemoRasterSource(source) else { throw DemoFailure.invalid("Invalid raster tile source") }
        map.base = raster
    }
    func setOptions(_ options: DemoMapOptionsRecord) throws {
        if let scale = options.altitudeScale {
            guard (0...10).contains(scale) else { throw DemoFailure.invalid("altitudeScale must be within 0...10") }
            map.altitudeScale = Float(scale)
        }
        if let value = options.hillshades { map.drawHillshades = value }
        if let value = options.elevationLines { map.drawElevationLines = value }
        if let value = options.slopes { map.drawSlopes = value }
        if let insets = options.visibleInsets {
            visibleInsets = UIEdgeInsets(top: insets.top, left: insets.left, bottom: insets.bottom, right: insets.right)
            map.invalidateVisibleMapInsets()
        }
        if let origin = options.origin { map.mapOrigin = CGPoint(x: origin.x, y: origin.y) }
        if let clipping = options.clipping {
            guard clipping.bounds.isValid else { throw DemoFailure.invalid("Invalid clipping bounds") }
            map.enableClipping(clipping.bounds.native, minLevel: Float(clipping.minLevel), maxLevel: Float(clipping.maxLevel))
        }
    }
    func reloadTiles() { map.reloadTiles() }

    func captureState(_ promise: Promise) {
        guard !disposed, window != nil else { promise.reject(.disposed); return }
        let request = retain(promise)
        map.captureState { [weak self] state in
            let center = state.geoCenter
            self?.release(request)?.resolve(["latitude": center.lat, "longitude": center.lon,
                "zoom": state.zoom, "scale": state.scale, "angle": Double(state.angle), "pitch": Double(state.pitch),
                "originX": state.origin.x, "originY": state.origin.y])
        }
    }

    func moveCamera(_ update: DemoCameraRecord, _ animation: DemoAnimationRecord?) throws {
        guard [update.center, update.visibleCenter].allSatisfy({ $0?.isValid ?? true }), update.bounds?.isValid ?? true,
              [update.zoom, update.angle, update.pitch, update.zoomDelta, animation?.duration].allSatisfy({ $0?.isFinite ?? true }),
              update.angle.map({ Float($0).isFinite }) ?? true, update.pitch.map({ (0...45).contains($0) }) ?? true,
              (animation?.duration ?? 0) >= 0 else { throw DemoFailure.invalid("Invalid camera update") }
        let apply = { [self] in
            if let bounds = update.bounds {
                let box = bounds.native, scale = map.mapScale(for: box)
                if scale.isFinite { map.mapScale = scale * pow(2, update.zoomDelta ?? 0) } else { map.mapZoomLevel = 15 }
                centerVisibleArea(on: box.center)
            }
            if let zoom = update.zoom { map.mapZoomLevel = zoom }
            if let center = update.center { map.mapGeoCenter = center.native }
            if let center = update.visibleCenter { centerVisibleArea(on: GLMapPoint(geoPoint: center.native)) }
            if let angle = update.angle { map.mapAngle = Float(angle) }
            if let pitch = update.pitch { map.mapPitch = Float(pitch) }
        }
        guard let animation else { apply(); return }
        cameraAnimation?.cancel(false)
        cameraAnimation = map.animate { native in
            if let duration = animation.duration { native.duration = duration }
            if let flyTo = animation.flyTo { native.flyToMode = flyTo ? .enabled : .disabled }
            if animation.linear == true { native.transition = .linear }
            apply()
        }
    }
    /// Insets constrain the fitted scale but do not move the camera.
    private func centerVisibleArea(on point: GLMapPoint) {
        let origin = map.mapOrigin
        let offset = CGPoint(x: (visibleInsets.right - visibleInsets.left) * 0.5 + map.bounds.width * (0.5 - origin.x),
                             y: (visibleInsets.bottom - visibleInsets.top) * 0.5 + map.bounds.height * (0.5 - origin.y))
        let delta = map.makeMapPoint(fromDisplayDelta: offset, andMapScale: map.mapScale, andMapAngle: map.mapAngle)
        map.mapCenter = GLMapPoint(x: point.x + delta.x, y: point.y + delta.y)
    }
    func project(_ coordinates: [Double]) throws -> [Double] {
        guard coordinates.count % 2 == 0 else { throw DemoFailure.invalid("Expected longitude/latitude pairs") }
        return stride(from: 0, to: coordinates.count, by: 2).flatMap { index -> [Double] in
            let point = map.makeDisplayPoint(from: GLMapPoint(lat: coordinates[index + 1], lon: coordinates[index]))
            return [point.x, point.y]
        }
    }
    func pickMapObject(_ x: Double, _ y: Double, _ distance: Double) -> [String: Any]? {
        guard let object = map.state.mapObject(at: CGPoint(x: x, y: y), maxDistance: distance) else { return nil }
        let point = GLMapGeoPoint(point: object.point)
        return ["name": object.localizedName(map.localeSettings)?.asString() ?? "", "latitude": point.lat, "longitude": point.lon]
    }

    // MARK: Drawables

    private func color(_ value: String) throws -> GLMapColor {
        let digits = value.dropFirst()
        guard value.hasPrefix("#"), digits.count == 6 || digits.count == 8, let number = UInt32(digits, radix: 16) else { throw DemoFailure.invalid("Expected #RRGGBB or #RRGGBBAA, got \(value)") }
        let rgba = digits.count == 6 ? number << 8 | 0xFF : number
        return GLMapColor(red: UInt8(rgba >> 24 & 0xFF), green: UInt8(rgba >> 16 & 0xFF), blue: UInt8(rgba >> 8 & 0xFF), alpha: UInt8(rgba & 0xFF))
    }
    private func image(_ source: DemoImageRecord) throws -> UIImage {
        let path = try DemoAssets.path(source.svg), factory = GLMapVectorImageFactory.shared
        guard source.scale.isFinite, source.scale > 0 else { throw DemoFailure.invalid("Image scale must be positive") }
        let image = try source.tint.map { factory.image(fromSvg: path, withScale: source.scale, andTintColor: try color($0)) } ?? factory.image(fromSvg: path, withScale: source.scale)
        guard let image else { throw DemoFailure.sdk("Cannot render \(source.svg)") }
        return image
    }
    private func vectorStyle(_ css: String) throws -> GLMapVectorStyle {
        guard let style = GLMapVectorStyle.createStyle(css) else { throw DemoFailure.invalid("Invalid style \(css)") }
        return style
    }
    private func drawOrder(_ value: Int) throws -> Int32 {
        guard let order = Int32(exactly: value) else { throw DemoFailure.invalid("drawOrder must fit int32") }
        return order
    }
    private func add(_ drawable: DemoDrawable) -> Int {
        lastDrawable += 1
        drawables[lastDrawable] = drawable
        drawable.objects.forEach(map.add)
        return lastDrawable
    }
    private func drawable(_ id: Int) throws -> DemoDrawable {
        guard let drawable = drawables[id] else { throw DemoFailure.notFound("Drawable \(id) has been removed") }
        return drawable
    }
    private func object<T>(_ id: Int, _: T.Type) throws -> (DemoDrawable, T) {
        let drawable = try drawable(id)
        guard let object = drawable.objects.first as? T else { throw DemoFailure.invalid("Drawable \(id) is not a \(T.self)") }
        return (drawable, object)
    }
    func setHidden(_ id: Int, _ hidden: Bool) throws {
        let value = try drawable(id)
        value.hidden = hidden
        value.objects.forEach { $0.hidden = hidden }
        updateLocationVisibility(value)
    }
    private func updateLocationVisibility(_ drawable: DemoDrawable) {
        guard let user = drawable.userLocation else { return }
        let location = user.lastLocation
        user.locationImage.hidden = drawable.hidden || location == nil || location!.course >= 0
        user.movementImage.hidden = drawable.hidden || location == nil || location!.course < 0
        user.accuracyCircle.hidden = drawable.hidden || location == nil
    }
    func removeDrawable(_ id: Int) {
        guard let drawable = drawables.removeValue(forKey: id) else { return }
        drawable.animation?.cancel(false)
        drawable.objects.forEach(map.remove)
        drawable.userLocation?.remove(fromMap: map)
    }

    func addImage(_ options: DemoImageOptionsRecord) throws -> Int {
        guard options.anchor == "center" || options.anchor == "bottom" else { throw DemoFailure.invalid("Unknown anchor \(options.anchor)") }
        let picture = try image(options.image), native = GLMapImage(drawOrder: try drawOrder(options.drawOrder))
        native.setImage(picture, completion: nil)
        native.offset = CGPoint(x: picture.size.width / 2, y: options.anchor == "center" ? picture.size.height / 2 : 0)
        native.position = GLMapPoint(lat: options.latitude, lon: options.longitude)
        native.scale = options.scale
        native.hidden = options.hidden
        let drawable = DemoDrawable(); drawable.objects = [native]
        return add(drawable)
    }
    func updateImage(_ id: Int, _ change: DemoImageChangeRecord, _ duration: Double) throws {
        let (drawable, native) = try object(id, GLMapImage.self)
        guard (change.latitude == nil) == (change.longitude == nil), duration.isFinite, duration >= 0 else { throw DemoFailure.invalid("Invalid image change") }
        let apply = {
            if let latitude = change.latitude, let longitude = change.longitude { native.position = GLMapPoint(lat: latitude, lon: longitude) }
            if let scale = change.scale { native.scale = scale }
        }
        drawable.animation?.cancel(false)
        drawable.animation = duration > 0 ? map.animate { animation in animation.duration = duration; apply() } : nil
        if duration == 0 { apply() }
    }
    func addImageGroup(_ options: DemoImageGroupRecord) throws -> Int {
        guard !options.images.isEmpty else { throw DemoFailure.invalid("An image group needs images") }
        let pins = DemoPins(try options.images.map(image)), drawable = DemoDrawable()
        drawable.pins = pins
        drawable.objects = [GLMapImageGroup(callback: pins, andDrawOrder: try drawOrder(options.drawOrder))]
        return add(drawable)
    }
    func setImageGroupPins(_ id: Int, _ pins: [Double]) throws {
        let (drawable, group) = try object(id, GLMapImageGroup.self)
        guard let source = drawable.pins, pins.count % 3 == 0 else { throw DemoFailure.invalid("Expected longitude/latitude/image triples") }
        source.set(try stride(from: 0, to: pins.count, by: 3).map { index in
            guard let variant = UInt32(exactly: pins[index + 2]), variant < source.variantCount else { throw DemoFailure.invalid("Unknown image index") }
            return (GLMapPoint(lat: pins[index + 1], lon: pins[index]), variant)
        })
        group.setNeedsUpdate(false)
    }

    func addMarkerLayer(_ options: DemoMarkerLayerRecord, _ pointsBuffer: NativeArrayBuffer?, _ promise: Promise) {
        guard !disposed else { promise.reject(.disposed); return }
        do {
            let order = try drawOrder(options.drawOrder), images = try options.images.map(image)
            guard !images.isEmpty, (options.markers.asset == nil) != (pointsBuffer == nil) else { throw DemoFailure.invalid("A marker layer needs images and one marker source") }
            let styles = GLMapMarkerStyleCollection(), labelKey = options.labelKey
            images.forEach { styles.addStyle(with: $0) }
            let text = try vectorStyle("{text-color:black;font-size:12;font-stroke-width:1pt;font-stroke-color:#FFFFFFEE;}")
            styles.setMarkerLocationBlock { ($0 as? DemoMarker)?.point ?? ($0 as? GLMapVectorObject)?.point ?? GLMapPoint() }
            styles.setMarkerDataFill { marker, data in
                data.setStyle(0)
                if let labelKey, let label = (marker as? GLMapVectorObject)?.value(forKey: labelKey)?.asString() { data.setText(label, offset: CGPoint(x: 0, y: 8), style: text) }
            }
            if options.clustered {
                styles.setMarkerUnionFill { count, data in
                    data.setStyle(UInt32(min(Int(log2(Double(count))), images.count - 1)))
                    data.setText("\(count)", offset: .zero, style: text)
                }
            }
            let radius = options.clustered ? Double(images.map(\.size.width).max() ?? 0) / 2 : 0
            if let buffer = pointsBuffer {
                let points = try buffer.demoDoubles()
                guard points.count % 2 == 0 else { throw DemoFailure.invalid("Expected longitude/latitude pairs") }
                let markers = stride(from: 0, to: points.count, by: 2).map { DemoMarker($0 / 2, GLMapPoint(lat: points[$0 + 1], lon: points[$0])) }
                var box = GLMapBBox.empty
                markers.forEach { box.add(point: $0.point) }
                let drawable = DemoDrawable()
                drawable.markers = markers
                drawable.objects = [GLMapMarkerLayer(markers: markers, andStyles: styles, clusteringRadius: radius, drawOrder: order)]
                promise.resolve(["id": add(drawable), "bounds": box.record, "count": markers.count])
                return
            }
            let path = try DemoAssets.path(options.markers.asset!), request = retain(promise)
            DispatchQueue.global().async {
                let loaded = Result { try GLMapVectorObject.createVectorObjects(fromFile: path) }
                DispatchQueue.main.async { [weak self] in
                    guard let self, let promise = release(request) else { return }
                    promise.settle {
                        let objects = try loaded.get(), drawable = DemoDrawable()
                        drawable.objects = [GLMapMarkerLayer(vectorObjects: objects, andStyles: styles, clusteringRadius: radius, drawOrder: order)]
                        return ["id": self.add(drawable), "bounds": objects.bbox.record, "count": Int(objects.count)]
                    }
                }
            }
        } catch { promise.reject(DemoFailure(error)) }
    }
    func pickMarker(_ id: Int, _ x: Double, _ y: Double, _ distance: Double) throws -> Int? {
        let (_, layer) = try object(id, GLMapMarkerLayer.self)
        var point = map.makeMapPoint(fromDisplay: CGPoint(x: x, y: y))
        return (layer.objects(at: map, nearPoint: &point, distance: distance)?.first as? DemoMarker)?.index
    }
    func swapMarkers(_ id: Int, _ show: [Int], _ hide: [Int]) throws {
        let (drawable, layer) = try object(id, GLMapMarkerLayer.self)
        guard (show + hide).allSatisfy(drawable.markers.indices.contains) else { throw DemoFailure.invalid("Unknown marker index") }
        layer.add(show.map { drawable.markers[$0] }, remove: hide.map { drawable.markers[$0] }, animated: true, completion: nil)
    }

    private func fill(_ balloon: GLMapBalloon, _ options: DemoBalloonRecord) throws {
        balloon.setText(options.text, with: try vectorStyle(options.textStyle), insets: UIEdgeInsets(top: 8, left: 12, bottom: 8, right: 12), completion: nil)
        balloon.position = GLMapPoint(lat: options.latitude, lon: options.longitude)
    }
    func addBalloon(_ options: DemoBalloonRecord) throws -> Int {
        guard let background = UIImage(named: "balloon", in: DemoAssets.bundle, with: nil) else { throw DemoFailure.notFound("Asset balloon.png is not bundled") }
        let balloon = GLMapBalloon(drawOrder: try drawOrder(options.drawOrder))
        let vertical = floor(background.size.height / 2), horizontal = floor(background.size.width / 2)
        balloon.setBackgroundImage(background, insets: UIEdgeInsets(top: vertical, left: horizontal, bottom: vertical, right: horizontal))
        try fill(balloon, options)
        let drawable = DemoDrawable(); drawable.objects = [balloon]
        return add(drawable)
    }
    func updateBalloon(_ id: Int, _ change: DemoBalloonRecord) throws { try fill(try object(id, GLMapBalloon.self).1, change) }

    func addTrack(_ options: DemoTrackRecord) throws -> Int {
        let track = GLMapTrack(drawOrder: try drawOrder(options.drawOrder)), drawable = DemoDrawable()
        if let progress = options.progressColor { track.progressColor = try color(progress) }
        drawable.style = try vectorStyle(options.style)
        drawable.objects = [track]
        return add(drawable)
    }
    func setTrackRoute(_ id: Int, _ routeId: Int, _ tint: String) throws {
        let (drawable, track) = try object(id, GLMapTrack.self)
        guard let style = drawable.style, let data = try DemoSdk.shared.route(routeId).trackData(with: try color(tint)) else { throw DemoFailure.sdk("Route has no geometry") }
        drawable.animation?.cancel(false)
        drawable.trackData = data
        track.progressIndex = 0
        track.setData(data, style: style, completion: nil)
    }
    func appendTrackPoint(_ id: Int, _ point: DemoGeoRecord, _ tint: String) throws {
        let (drawable, track) = try object(id, GLMapTrack.self)
        guard let style = drawable.style, point.isValid else { throw DemoFailure.invalid("Invalid track point") }
        var next = GLTrackPoint(pt: GLMapPoint(geoPoint: point.native), color: try color(tint))
        drawable.trackData = drawable.trackData?.appending(next, startingNewSegment: false) ?? GLMapTrackData(points: &next, count: 1)
        track.setData(drawable.trackData, style: style, completion: nil)
    }
    func setTrackProgress(_ id: Int, _ progress: Double, _ duration: Double) throws {
        let (drawable, track) = try object(id, GLMapTrack.self)
        guard progress.isFinite, duration.isFinite, duration >= 0 else { throw DemoFailure.invalid("Invalid track progress") }
        drawable.animation?.cancel(false)
        drawable.animation = duration > 0 ? map.animate { animation in animation.transition = .linear; animation.duration = duration; track.progressIndex = progress } : nil
        if duration == 0 { track.progressIndex = progress }
    }

    func addLineArrow(_ options: DemoLineArrowRecord) throws -> Int {
        let arrow = GLMapLineArrow(drawOrder: try drawOrder(options.drawOrder))
        arrow.setLineStyle(try vectorStyle(options.style), head: try image(options.head))
        arrow.hidden = options.hidden
        let drawable = DemoDrawable(); drawable.objects = [arrow]
        return add(drawable)
    }
    func setLineArrowManeuver(_ id: Int, _ routeId: Int, _ index: Int) throws {
        let arrow = try object(id, GLMapLineArrow.self).1, maneuvers = try DemoSdk.shared.route(routeId).allManeuvers
        guard maneuvers.indices.contains(index) else { throw DemoFailure.notFound("Route has no maneuver \(index)") }
        arrow.setLine(maneuvers[index].line, index: maneuvers[index].lineStartIndex)
    }

    func addUserLocation(_ order: Int) throws -> Int {
        var still = DemoImageRecord(), moving = DemoImageRecord()
        still.svg = "user_location.svg"; moving.svg = "user_movement.svg"
        let drawable = DemoDrawable()
        drawable.userLocation = GLMapUserLocation(drawOrder: try drawOrder(order), locationImage: try image(still), movementImage: try image(moving))
        drawable.userLocation?.add(toMap: map)
        updateLocationVisibility(drawable)
        return add(drawable)
    }
    func updateUserLocation(_ id: Int, _ location: DemoLocationRecord, _ animated: Bool) throws {
        let drawable = try drawable(id)
        guard let user = drawable.userLocation, location.point.isValid else { throw DemoFailure.invalid("Drawable \(id) is not a user location") }
        let fix = CLLocation(coordinate: CLLocationCoordinate2D(latitude: location.latitude, longitude: location.longitude), altitude: 0, horizontalAccuracy: location.accuracy,
                             verticalAccuracy: -1, course: location.bearing ?? -1, speed: location.speed ?? -1, timestamp: Date())
        let manager = DemoSdk.shared.location.manager
        drawable.animation?.cancel(false)
        drawable.animation = animated ? map.animate { animation in
            animation.duration = 1
            animation.transition = .linear
            user.locationManager(manager, didUpdateLocations: [fix])
        } : nil
        if !animated { user.locationManager(manager, didUpdateLocations: [fix]) }
        updateLocationVisibility(drawable)
    }

    func addVectorLayer(_ options: DemoVectorLayerRecord, _ coordinates: NativeArrayBuffer?, _ promise: Promise) {
        guard !disposed else { promise.reject(.disposed); return }
        do {
            let order = try drawOrder(options.drawOrder), source = options.source
            guard let style = GLMapVectorCascadeStyle.createStyle(options.style) else { throw DemoFailure.invalid("Invalid style \(options.style)") }
            guard (coordinates == nil) != (source.asset == nil) else { throw DemoFailure.invalid("A vector layer needs one source") }
            let show: (GLMapVectorObjectArray) -> [String: Any?] = { [self] objects in
                let layer = GLMapVectorLayer(drawOrder: order), drawable = DemoDrawable()
                layer.setVectorObjects(objects, with: style, completion: nil)
                drawable.vectorObjects = objects
                drawable.objects = [layer]
                return ["id": add(drawable), "bounds": objects.bbox.record]
            }
            if let asset = source.asset {
                let path = try DemoAssets.path(asset), request = retain(promise)
                DispatchQueue.global().async {
                    let loaded = Result { try GLMapVectorObject.createVectorObjects(fromFile: path) }
                    DispatchQueue.main.async { [weak self] in self?.release(request)?.settle { show(try loaded.get()) } }
                }
                return
            }
            let rings = try coordinates!.demoLines(source.counts), builder = GeometryBuilder()
            guard rings.allSatisfy({ $0.count >= 4 && $0.count % 2 == 0 && $0.allSatisfy(\.isFinite) }) else { throw DemoFailure.invalid("Expected longitude/latitude pairs") }
            if source.polygon { builder.beginPolygon() }
            for ring in rings { builder.addLine(UInt(ring.count / 2)) { GLMapPoint(lat: ring[Int($0) * 2 + 1], lon: ring[Int($0) * 2]) } }
            guard let object = builder.build() else { throw DemoFailure.sdk("GeometryBuilder returned no object") }
            let objects = GLMapVectorObjectArray()
            objects.add(object)
            promise.resolve(show(objects))
        } catch { promise.reject(DemoFailure(error)) }
    }
    func pickVectorObject(_ id: Int, _ x: Double, _ y: Double, _ distance: Double) throws -> String? {
        guard let objects = try drawable(id).vectorObjects else { throw DemoFailure.invalid("Drawable \(id) is not a vector layer") }
        let point = map.makeMapPoint(fromDisplay: CGPoint(x: x, y: y)), delta = map.makeMapPoint(fromDisplayDelta: CGPoint(x: 0, y: distance))
        let reach = hypot(delta.x, delta.y)
        for index in 0..<objects.count {
            var nearest = point
            if objects[index].findNearestPoint(&nearest, to: point, maxDistance: reach) { return objects[index].asGeoJSON() }
        }
        return nil
    }

    private func dispose() {
        if disposed { return }
        disposed = true
        let replies = pending; pending.removeAll()
        replies.values.forEach { $0.reject(.disposed) }
        map.tapGestureBlock = nil
        map.longPressGestureBlock = nil
        map.visibleMapInsetsProvider = nil
        cameraAnimation?.cancel(false)
        Array(drawables.keys).forEach(removeDrawable)
        map.removeFromSuperview()
    }
    deinit { dispose() }
}
