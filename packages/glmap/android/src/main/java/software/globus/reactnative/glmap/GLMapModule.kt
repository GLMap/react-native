package software.globus.reactnative.glmap

import android.content.Context
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.jni.NativeArrayBuffer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

import software.globus.reactnative.core.*
class GLMapModule:Module() {
    override fun definition()=ModuleDefinition {
        Name("GLMap")
        View(GLMapDemoView::class) {
            AsyncFunction("queryHandle") { view:GLMapDemoView,promise:Promise -> view.settle(promise) { view.queryId } }
            Events("onMapReady", "onMapTap", "onMapLongPress")
            AsyncFunction("setStyleOptions") { view: GLMapDemoView, options: Map<String, String>, promise: Promise -> view.settle(promise) { view.setStyleOptions(options); null } }
            AsyncFunction("setTileSource") { view: GLMapDemoView, source: DemoRasterRecord?, promise: Promise -> view.settle(promise) { view.setTileSource(source); null } }
            AsyncFunction("setOptions") { view: GLMapDemoView, options: DemoMapOptionsRecord, promise: Promise -> view.settle(promise) { view.setOptions(options); null } }
            AsyncFunction("reloadTiles") { view: GLMapDemoView, promise: Promise -> view.settle(promise) { view.reloadTiles(); null } }
            AsyncFunction("captureState") { view: GLMapDemoView, promise: Promise -> view.captureState(promise) }
            AsyncFunction("moveCamera") { view: GLMapDemoView, update: DemoCameraRecord, animation: DemoAnimationRecord?, promise: Promise ->
                view.settle(promise) { view.moveCamera(update, animation); null }
            }
            AsyncFunction("project") { view: GLMapDemoView, coordinates: NativeArrayBuffer, promise: Promise -> view.settle(promise) { view.project(coordinates.demoDoubles()) } }
            AsyncFunction("addImage") { view: GLMapDemoView, options: DemoImageOptionsRecord, promise: Promise -> view.settle(promise) { view.addImage(options) } }
            AsyncFunction("updateImage") { view: GLMapDemoView, id: Int, change: DemoImageChangeRecord, duration: Double, promise: Promise ->
                view.settle(promise) { view.updateImage(id, change, duration); null }
            }
            AsyncFunction("addImageGroup") { view: GLMapDemoView, options: DemoImageGroupRecord, promise: Promise -> view.settle(promise) { view.addImageGroup(options) } }
            AsyncFunction("setImageGroupPins") { view: GLMapDemoView, id: Int, pins: NativeArrayBuffer, promise: Promise -> view.settle(promise) { view.setImageGroupPins(id, pins.demoDoubles(stride = 3)); null } }
            AsyncFunction("addMarkerLayer") { view: GLMapDemoView, options: DemoMarkerLayerRecord, points: NativeArrayBuffer?, promise: Promise -> view.addMarkerLayer(options, points, promise) }
            AsyncFunction("pickMarker") { view: GLMapDemoView, id: Int, x: Double, y: Double, distance: Double, promise: Promise ->
                view.settle(promise) { view.pickMarker(id, x, y, distance) }
            }
            AsyncFunction("swapMarkers") { view: GLMapDemoView, id: Int, show: List<Int>, hide: List<Int>, promise: Promise ->
                view.settle(promise) { view.swapMarkers(id, show, hide); null }
            }
            AsyncFunction("addBalloon") { view: GLMapDemoView, options: DemoBalloonRecord, promise: Promise -> view.settle(promise) { view.addBalloon(options) } }
            AsyncFunction("updateBalloon") { view: GLMapDemoView, id: Int, change: DemoBalloonRecord, promise: Promise -> view.settle(promise) { view.updateBalloon(id, change); null } }
            AsyncFunction("addTrack") { view: GLMapDemoView, options: DemoTrackRecord, promise: Promise -> view.settle(promise) { view.addTrack(options) } }
            AsyncFunction("setTrackRoute") { view: GLMapDemoView, id: Int, route: Int, color: String, promise: Promise ->
                view.settle(promise) { view.setTrackRoute(id, route, color); null }
            }
            AsyncFunction("appendTrackPoint") { view: GLMapDemoView, id: Int, point: DemoGeoRecord, color: String, promise: Promise ->
                view.settle(promise) { view.appendTrackPoint(id, point, color); null }
            }
            AsyncFunction("setTrackProgress") { view: GLMapDemoView, id: Int, progress: Double, duration: Double, promise: Promise ->
                view.settle(promise) { view.setTrackProgress(id, progress, duration); null }
            }
            AsyncFunction("addLineArrow") { view: GLMapDemoView, options: DemoLineArrowRecord, promise: Promise -> view.settle(promise) { view.addLineArrow(options) } }
            AsyncFunction("setLineArrowManeuver") { view: GLMapDemoView, id: Int, route: Int, index: Int, promise: Promise ->
                view.settle(promise) { view.setLineArrowManeuver(id, route, index); null }
            }
            AsyncFunction("addUserLocation") { view: GLMapDemoView, drawOrder: Int, promise: Promise -> view.settle(promise) { view.addUserLocation(drawOrder) } }
            AsyncFunction("updateUserLocation") { view: GLMapDemoView, id: Int, fix: DemoLocationRecord, animated: Boolean, promise: Promise ->
                view.settle(promise) { view.updateUserLocation(id, fix, animated); null }
            }
            AsyncFunction("addVectorLayer") { view: GLMapDemoView, options: DemoVectorLayerRecord, coordinates: NativeArrayBuffer?, promise: Promise -> view.addVectorLayer(options, coordinates, promise) }
            AsyncFunction("pickVectorObject") { view: GLMapDemoView, id: Int, x: Double, y: Double, distance: Double, promise: Promise ->
                view.settle(promise) { view.pickVectorObject(id, x, y, distance) }
            }
            AsyncFunction("setHidden") { view: GLMapDemoView, id: Int, hidden: Boolean, promise: Promise -> view.settle(promise) { view.setHidden(id, hidden); null } }
            AsyncFunction("removeDrawable") { view: GLMapDemoView, id: Int, promise: Promise -> view.settle(promise) { view.removeDrawable(id); null } }
            OnViewDestroys { view: GLMapDemoView -> view.dispose() }
        }
    }
}
