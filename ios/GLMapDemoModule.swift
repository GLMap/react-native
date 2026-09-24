import ExpoModulesCore

struct DemoGeoRecord: Record {
    @Field var latitude: Double = 0
    @Field var longitude: Double = 0
}
struct DemoBoundsRecord: Record {
    @Field var south: Double = 0
    @Field var west: Double = 0
    @Field var north: Double = 0
    @Field var east: Double = 0
}
struct DemoAreaFileRecord: Record {
    @Field var dataSet: String = ""
    @Field var fileName: String = ""
}
struct DemoSearchRecord: Record {
    @Field var text: String = ""
    @Field var type: String = "search"
    @Field var offline: Bool = false
    @Field var center: DemoGeoRecord = DemoGeoRecord()
    @Field var limit: Int = 0
    @Field var categories: [String]?
}
struct DemoRouteQueryRecord: Record {
    @Field var points: [DemoGeoRecord] = []
    @Field var mode: String = "car"
    @Field var offline: Bool = false
}
struct DemoRouteStepRecord: Record {
    @Field var instruction: String = ""
    @Field var turn: String = "continue"
    @Field var duration: Double = 0
}
struct DemoLocationRecord: Record {
    @Field var latitude: Double = 0
    @Field var longitude: Double = 0
    @Field var accuracy: Double = 0
    @Field var bearing: Double?
    @Field var speed: Double?
    var point: DemoGeoRecord { var point = DemoGeoRecord(); point.latitude = latitude; point.longitude = longitude; return point }
}
struct DemoImageRecord: Record {
    @Field var svg: String = ""
    @Field var scale: Double = 1
    @Field var tint: String?
}
struct DemoCameraRecord: Record {
    @Field var center: DemoGeoRecord?
    @Field var visibleCenter: DemoGeoRecord?
    @Field var zoom: Double?
    @Field var angle: Double?
    @Field var pitch: Double?
    @Field var bounds: DemoBoundsRecord?
    @Field var zoomDelta: Double?
}
struct DemoAnimationRecord: Record {
    @Field var duration: Double?
    @Field var flyTo: Bool?
    @Field var linear: Bool?
}
struct DemoInsetsRecord: Record {
    @Field var top: Double = 0
    @Field var left: Double = 0
    @Field var bottom: Double = 0
    @Field var right: Double = 0
}
struct DemoOriginRecord: Record {
    @Field var x: Double = 0.5
    @Field var y: Double = 0.5
}
struct DemoClippingRecord: Record {
    @Field var bounds: DemoBoundsRecord = DemoBoundsRecord()
    @Field var minLevel: Double = 0
    @Field var maxLevel: Double = 0
}
struct DemoMapOptionsRecord: Record {
    @Field var altitudeScale: Double?
    @Field var hillshades: Bool?
    @Field var elevationLines: Bool?
    @Field var slopes: Bool?
    @Field var visibleInsets: DemoInsetsRecord?
    @Field var origin: DemoOriginRecord?
    @Field var clipping: DemoClippingRecord?
}
struct DemoRasterRecord: Record {
    @Field var urlTemplates: [String] = []
    @Field var attribution: String = ""
    @Field var cacheName: String = ""
}
struct DemoImageOptionsRecord: Record {
    @Field var latitude: Double = 0
    @Field var longitude: Double = 0
    @Field var image: DemoImageRecord = DemoImageRecord()
    @Field var anchor: String = "center"
    @Field var drawOrder: Int = 0
    @Field var hidden: Bool = false
    @Field var scale: Double = 1
}
struct DemoImageChangeRecord: Record {
    @Field var latitude: Double?
    @Field var longitude: Double?
    @Field var scale: Double?
}
struct DemoImageGroupRecord: Record {
    @Field var images: [DemoImageRecord] = []
    @Field var drawOrder: Int = 0
}
struct DemoMarkerSourceRecord: Record {
    @Field var asset: String?
}
struct DemoMarkerLayerRecord: Record {
    @Field var markers: DemoMarkerSourceRecord = DemoMarkerSourceRecord()
    @Field var images: [DemoImageRecord] = []
    @Field var clustered: Bool = false
    @Field var labelKey: String?
    @Field var drawOrder: Int = 0
}
struct DemoBalloonRecord: Record {
    @Field var latitude: Double = 0
    @Field var longitude: Double = 0
    @Field var text: String = ""
    @Field var textStyle: String = ""
    @Field var drawOrder: Int = 0
}
struct DemoTrackRecord: Record {
    @Field var style: String = ""
    @Field var drawOrder: Int = 0
    @Field var progressColor: String?
}
struct DemoLineArrowRecord: Record {
    @Field var style: String = ""
    @Field var head: DemoImageRecord = DemoImageRecord()
    @Field var drawOrder: Int = 0
    @Field var hidden: Bool = false
}
struct DemoVectorSourceRecord: Record {
    @Field var polygon: Bool = false
    @Field var counts: [Int] = []
    @Field var asset: String?
}
struct DemoVectorLayerRecord: Record {
    @Field var source: DemoVectorSourceRecord = DemoVectorSourceRecord()
    @Field var style: String = ""
    @Field var drawOrder: Int = 0
}

public final class GLMapDemoModule: Module {
    public func definition() -> ModuleDefinition {
        Name("GLMapDemo")
        Events("onRegionsChanged", "onRegionProgress", "onAreaProgress", "onLocation")
        OnCreate { DispatchQueue.main.async { DemoSdk.shared.attach(self) { [weak self] name, body in self?.sendEvent(name, body) } } }
        OnDestroy { DispatchQueue.main.async { DemoSdk.shared.detach(self) } }

        let sdk = DemoSdk.shared
        AsyncFunction("initialize") { (apiKey: String, promise: Promise) in promise.settle { try sdk.initialize(apiKey); return nil } }.runOnQueue(.main)
        AsyncFunction("setTileDownloadingAllowed") { (allowed: Bool, promise: Promise) in promise.settle { sdk.setTileDownloadingAllowed(allowed); return nil } }.runOnQueue(.main)
        AsyncFunction("addDataSet") { (asset: String, kind: String, promise: Promise) in promise.settle { try sdk.addDataSet(asset, kind); return nil } }.runOnQueue(.main)
        AsyncFunction("regions") { (parent: String?, refresh: Bool, promise: Promise) in sdk.regions(parent, refresh, promise) }.runOnQueue(.main)
        AsyncFunction("downloadRegion") { (id: String, promise: Promise) in promise.settle { try sdk.downloadRegion(id); return nil } }.runOnQueue(.main)
        AsyncFunction("cancelRegionDownload") { (id: String, promise: Promise) in promise.settle { try sdk.cancelRegionDownload(id); return nil } }.runOnQueue(.main)
        AsyncFunction("deleteRegion") { (id: String, promise: Promise) in promise.settle { try sdk.deleteRegion(id); return nil } }.runOnQueue(.main)
        AsyncFunction("downloadArea") { (id: Int, bounds: DemoBoundsRecord, files: [DemoAreaFileRecord], promise: Promise) in
            sdk.downloadArea(id, bounds, files, promise)
        }.runOnQueue(.main)
        AsyncFunction("search") { (id: Int, query: DemoSearchRecord, promise: Promise) in sdk.search(id, query, promise) }.runOnQueue(.main)
        AsyncFunction("route") { (id: Int, query: DemoRouteQueryRecord, promise: Promise) in sdk.route(id, query, promise) }.runOnQueue(.main)
        AsyncFunction("cancelRequest") { (id: Int, promise: Promise) in promise.settle { sdk.cancelRequest(id); return nil } }.runOnQueue(.main)
        AsyncFunction("buildRoute") { (steps: [DemoRouteStepRecord], coordinates: NativeArrayBuffer, counts: [Int], promise: Promise) in promise.settle { try sdk.buildRoute(steps, coordinates, counts) } }.runOnQueue(.main)
        AsyncFunction("routeCoordinates") { (id: Int, promise: Promise) in promise.settle { try sdk.routeCoordinates(id) } }.runOnQueue(.main)
        AsyncFunction("maneuver") { (id: Int, index: Int, promise: Promise) in promise.settle { try sdk.maneuver(id, index) } }.runOnQueue(.main)
        AsyncFunction("updateNavigation") { (id: Int, location: DemoLocationRecord, promise: Promise) in
            promise.settle { try sdk.updateNavigation(id, location) }
        }.runOnQueue(.main)
        AsyncFunction("releaseRoute") { (id: Int, promise: Promise) in promise.settle { sdk.releaseRoute(id); return nil } }.runOnQueue(.main)
        AsyncFunction("startLocationUpdates") { (promise: Promise) in sdk.location.start(promise) }.runOnQueue(.main)
        AsyncFunction("stopLocationUpdates") { (promise: Promise) in promise.settle { sdk.location.stop(); return nil } }.runOnQueue(.main)

        View(GLMapDemoView.self) {
            Events("onMapReady", "onMapTap", "onMapLongPress")
            AsyncFunction("setStyleOptions") { (view: GLMapDemoView, options: [String: String], promise: Promise) in view.settle(promise) { try view.setStyleOptions(options); return nil } }
            AsyncFunction("setTileSource") { (view: GLMapDemoView, source: DemoRasterRecord?, promise: Promise) in view.settle(promise) { try view.setTileSource(source); return nil } }
            AsyncFunction("setOptions") { (view: GLMapDemoView, options: DemoMapOptionsRecord, promise: Promise) in view.settle(promise) { try view.setOptions(options); return nil } }
            AsyncFunction("reloadTiles") { (view: GLMapDemoView, promise: Promise) in view.settle(promise) { view.reloadTiles(); return nil } }
            AsyncFunction("captureState") { (view: GLMapDemoView, promise: Promise) in view.captureState(promise) }
            AsyncFunction("moveCamera") { (view: GLMapDemoView, update: DemoCameraRecord, animation: DemoAnimationRecord?, promise: Promise) in
                view.settle(promise) { try view.moveCamera(update, animation); return nil }
            }
            AsyncFunction("project") { (view: GLMapDemoView, coordinates: NativeArrayBuffer, promise: Promise) in view.settle(promise) { try view.project(coordinates.demoDoubles()) } }
            AsyncFunction("pickMapObject") { (view: GLMapDemoView, x: Double, y: Double, distance: Double, promise: Promise) in
                view.settle(promise) { view.pickMapObject(x, y, distance) }
            }
            AsyncFunction("addImage") { (view: GLMapDemoView, options: DemoImageOptionsRecord, promise: Promise) in view.settle(promise) { try view.addImage(options) } }
            AsyncFunction("updateImage") { (view: GLMapDemoView, id: Int, change: DemoImageChangeRecord, duration: Double, promise: Promise) in
                view.settle(promise) { try view.updateImage(id, change, duration); return nil }
            }
            AsyncFunction("addImageGroup") { (view: GLMapDemoView, options: DemoImageGroupRecord, promise: Promise) in view.settle(promise) { try view.addImageGroup(options) } }
            AsyncFunction("setImageGroupPins") { (view: GLMapDemoView, id: Int, pins: NativeArrayBuffer, promise: Promise) in
                view.settle(promise) { try view.setImageGroupPins(id, pins.demoDoubles(stride: 3)); return nil }
            }
            AsyncFunction("addMarkerLayer") { (view: GLMapDemoView, options: DemoMarkerLayerRecord, points: NativeArrayBuffer?, promise: Promise) in view.addMarkerLayer(options, points, promise) }
            AsyncFunction("pickMarker") { (view: GLMapDemoView, id: Int, x: Double, y: Double, distance: Double, promise: Promise) in
                view.settle(promise) { try view.pickMarker(id, x, y, distance) }
            }
            AsyncFunction("swapMarkers") { (view: GLMapDemoView, id: Int, show: [Int], hide: [Int], promise: Promise) in
                view.settle(promise) { try view.swapMarkers(id, show, hide); return nil }
            }
            AsyncFunction("addBalloon") { (view: GLMapDemoView, options: DemoBalloonRecord, promise: Promise) in view.settle(promise) { try view.addBalloon(options) } }
            AsyncFunction("updateBalloon") { (view: GLMapDemoView, id: Int, change: DemoBalloonRecord, promise: Promise) in
                view.settle(promise) { try view.updateBalloon(id, change); return nil }
            }
            AsyncFunction("addTrack") { (view: GLMapDemoView, options: DemoTrackRecord, promise: Promise) in view.settle(promise) { try view.addTrack(options) } }
            AsyncFunction("setTrackRoute") { (view: GLMapDemoView, id: Int, route: Int, color: String, promise: Promise) in
                view.settle(promise) { try view.setTrackRoute(id, route, color); return nil }
            }
            AsyncFunction("appendTrackPoint") { (view: GLMapDemoView, id: Int, point: DemoGeoRecord, color: String, promise: Promise) in
                view.settle(promise) { try view.appendTrackPoint(id, point, color); return nil }
            }
            AsyncFunction("setTrackProgress") { (view: GLMapDemoView, id: Int, progress: Double, duration: Double, promise: Promise) in
                view.settle(promise) { try view.setTrackProgress(id, progress, duration); return nil }
            }
            AsyncFunction("addLineArrow") { (view: GLMapDemoView, options: DemoLineArrowRecord, promise: Promise) in view.settle(promise) { try view.addLineArrow(options) } }
            AsyncFunction("setLineArrowManeuver") { (view: GLMapDemoView, id: Int, route: Int, index: Int, promise: Promise) in
                view.settle(promise) { try view.setLineArrowManeuver(id, route, index); return nil }
            }
            AsyncFunction("addUserLocation") { (view: GLMapDemoView, drawOrder: Int, promise: Promise) in view.settle(promise) { try view.addUserLocation(drawOrder) } }
            AsyncFunction("updateUserLocation") { (view: GLMapDemoView, id: Int, location: DemoLocationRecord, animated: Bool, promise: Promise) in
                view.settle(promise) { try view.updateUserLocation(id, location, animated); return nil }
            }
            AsyncFunction("addVectorLayer") { (view: GLMapDemoView, options: DemoVectorLayerRecord, coordinates: NativeArrayBuffer?, promise: Promise) in view.addVectorLayer(options, coordinates, promise) }
            AsyncFunction("pickVectorObject") { (view: GLMapDemoView, id: Int, x: Double, y: Double, distance: Double, promise: Promise) in
                view.settle(promise) { try view.pickVectorObject(id, x, y, distance) }
            }
            AsyncFunction("setHidden") { (view: GLMapDemoView, id: Int, hidden: Bool, promise: Promise) in view.settle(promise) { try view.setHidden(id, hidden); return nil } }
            AsyncFunction("removeDrawable") { (view: GLMapDemoView, id: Int, promise: Promise) in view.settle(promise) { view.removeDrawable(id); return nil } }
        }
    }
}
