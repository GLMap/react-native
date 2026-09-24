import ExpoModulesCore
import GlobusMapCore
public final class GLMapModule:Module {
    public func definition()->ModuleDefinition {
        Name("GLMap")
        View(GLMapDemoView.self) {
            AsyncFunction("queryHandle") { (view:GLMapDemoView,promise:Promise) in view.settle(promise) { view.queryId } }
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
