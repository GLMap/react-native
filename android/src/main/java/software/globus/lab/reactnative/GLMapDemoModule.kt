package software.globus.lab.reactnative

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

class DemoGeoRecord : Record {
    @Field var latitude: Double = 0.0
    @Field var longitude: Double = 0.0
}
class DemoBoundsRecord : Record {
    @Field var south: Double = 0.0
    @Field var west: Double = 0.0
    @Field var north: Double = 0.0
    @Field var east: Double = 0.0
}
class DemoAreaFileRecord : Record {
    @Field var dataSet: String = ""
    @Field var fileName: String = ""
}
class DemoSearchRecord : Record {
    @Field var text: String = ""
    @Field var type: String = "search"
    @Field var offline: Boolean = false
    @Field var center: DemoGeoRecord = DemoGeoRecord()
    @Field var limit: Int = 0
    @Field var categories: List<String>? = null
}
class DemoRouteQueryRecord : Record {
    @Field var points: List<DemoGeoRecord> = emptyList()
    @Field var mode: String = "car"
    @Field var offline: Boolean = false
}
class DemoRouteStepRecord : Record {
    @Field var instruction: String = ""
    @Field var turn: String = "continue"
    @Field var duration: Double = 0.0
}
class DemoLocationRecord : Record {
    @Field var latitude: Double = 0.0
    @Field var longitude: Double = 0.0
    @Field var accuracy: Double = 0.0
    @Field var bearing: Double? = null
    @Field var speed: Double? = null
    val point get() = DemoGeoRecord().also { it.latitude = latitude; it.longitude = longitude }
}
class DemoImageRecord : Record {
    @Field var svg: String = ""
    @Field var scale: Double = 1.0
    @Field var tint: String? = null
}
class DemoCameraRecord : Record {
    @Field var center: DemoGeoRecord? = null
    @Field var visibleCenter: DemoGeoRecord? = null
    @Field var zoom: Double? = null
    @Field var angle: Double? = null
    @Field var pitch: Double? = null
    @Field var bounds: DemoBoundsRecord? = null
    @Field var zoomDelta: Double? = null
}
class DemoAnimationRecord : Record {
    @Field var duration: Double? = null
    @Field var flyTo: Boolean? = null
    @Field var linear: Boolean? = null
}
class DemoInsetsRecord : Record {
    @Field var top: Double = 0.0
    @Field var left: Double = 0.0
    @Field var bottom: Double = 0.0
    @Field var right: Double = 0.0
}
class DemoOriginRecord : Record {
    @Field var x: Double = 0.5
    @Field var y: Double = 0.5
}
class DemoClippingRecord : Record {
    @Field var bounds: DemoBoundsRecord = DemoBoundsRecord()
    @Field var minLevel: Double = 0.0
    @Field var maxLevel: Double = 0.0
}
class DemoMapOptionsRecord : Record {
    @Field var altitudeScale: Double? = null
    @Field var hillshades: Boolean? = null
    @Field var elevationLines: Boolean? = null
    @Field var slopes: Boolean? = null
    @Field var visibleInsets: DemoInsetsRecord? = null
    @Field var origin: DemoOriginRecord? = null
    @Field var clipping: DemoClippingRecord? = null
}
class DemoRasterRecord : Record {
    @Field var urlTemplates: List<String> = emptyList()
    @Field var attribution: String = ""
    @Field var cacheName: String = ""
}
class DemoImageOptionsRecord : Record {
    @Field var latitude: Double = 0.0
    @Field var longitude: Double = 0.0
    @Field var image: DemoImageRecord = DemoImageRecord()
    @Field var anchor: String = "center"
    @Field var drawOrder: Int = 0
    @Field var hidden: Boolean = false
    @Field var scale: Double = 1.0
}
class DemoImageChangeRecord : Record {
    @Field var latitude: Double? = null
    @Field var longitude: Double? = null
    @Field var scale: Double? = null
}
class DemoImageGroupRecord : Record {
    @Field var images: List<DemoImageRecord> = emptyList()
    @Field var drawOrder: Int = 0
}
class DemoMarkerSourceRecord : Record {
    @Field var asset: String? = null
}
class DemoMarkerLayerRecord : Record {
    @Field var markers: DemoMarkerSourceRecord = DemoMarkerSourceRecord()
    @Field var images: List<DemoImageRecord> = emptyList()
    @Field var clustered: Boolean = false
    @Field var labelKey: String? = null
    @Field var drawOrder: Int = 0
}
class DemoBalloonRecord : Record {
    @Field var latitude: Double = 0.0
    @Field var longitude: Double = 0.0
    @Field var text: String = ""
    @Field var textStyle: String = ""
    @Field var drawOrder: Int = 0
}
class DemoTrackRecord : Record {
    @Field var style: String = ""
    @Field var drawOrder: Int = 0
    @Field var progressColor: String? = null
}
class DemoLineArrowRecord : Record {
    @Field var style: String = ""
    @Field var head: DemoImageRecord = DemoImageRecord()
    @Field var drawOrder: Int = 0
    @Field var hidden: Boolean = false
}
class DemoVectorSourceRecord : Record {
    @Field var polygon: Boolean = false
    @Field var counts: List<Int> = emptyList()
    @Field var asset: String? = null
}
class DemoVectorLayerRecord : Record {
    @Field var source: DemoVectorSourceRecord = DemoVectorSourceRecord()
    @Field var style: String = ""
    @Field var drawOrder: Int = 0
}

class GLMapDemoModule : Module() {
    private val main = Handler(Looper.getMainLooper())
    private val location = DemoLocation { sendEvent("onLocation", it) }
    private val context: Context get() = appContext.reactContext ?: throw DemoFailure.disposed()

    override fun definition() = ModuleDefinition {
        Name("GLMapDemo")
        Events("onRegionsChanged", "onRegionProgress", "onAreaProgress", "onLocation")
        OnCreate { main.post { DemoSdk.attach(this@GLMapDemoModule) { name, body -> sendEvent(name, body) } } }
        OnDestroy { main.post { location.stop(); DemoSdk.detach(this@GLMapDemoModule) } }

        AsyncFunction("initialize") { apiKey: String, promise: Promise -> promise.settle { DemoSdk.initialize(context, apiKey); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("setTileDownloadingAllowed") { allowed: Boolean, promise: Promise ->
            promise.settle { DemoSdk.ensureInitialized(context); globus.glmap.GLMapManager.SetTileDownloadingAllowed(allowed); null }
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("addDataSet") { asset: String, kind: String, promise: Promise ->
            try { DemoSdk.addDataSet(context, asset, kind, promise) } catch (error: DemoFailure) { promise.reject(error) }
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("regions") { parent: String?, refresh: Boolean, promise: Promise -> DemoSdk.regions(parent, refresh, promise) }.runOnQueue(Queues.MAIN)
        AsyncFunction("downloadRegion") { id: String, promise: Promise -> promise.settle { DemoSdk.downloadRegion(id); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("cancelRegionDownload") { id: String, promise: Promise -> promise.settle { DemoSdk.cancelRegionDownload(id); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("deleteRegion") { id: String, promise: Promise -> promise.settle { DemoSdk.deleteRegion(id); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("downloadArea") { id: Int, bounds: DemoBoundsRecord, files: List<DemoAreaFileRecord>, promise: Promise ->
            try { DemoSdk.downloadArea(context, id, bounds, files, promise) } catch (error: DemoFailure) { promise.reject(error) }
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("search") { id: Int, query: DemoSearchRecord, promise: Promise -> DemoSdk.search(id, query, promise) }.runOnQueue(Queues.MAIN)
        AsyncFunction("route") { id: Int, query: DemoRouteQueryRecord, promise: Promise ->
            try { DemoSdk.route(context, id, query, promise) } catch (error: DemoFailure) { promise.reject(error) }
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("cancelRequest") { id: Int, promise: Promise -> promise.settle { DemoSdk.cancelRequest(id); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("buildRoute") { steps: List<DemoRouteStepRecord>, coordinates: NativeArrayBuffer, counts: List<Int>, promise: Promise -> promise.settle { DemoSdk.buildRoute(steps, coordinates, counts) } }.runOnQueue(Queues.MAIN)
        AsyncFunction("routeCoordinates") { id: Int, promise: Promise -> promise.settle { DemoSdk.routeCoordinates(id) } }.runOnQueue(Queues.MAIN)
        AsyncFunction("maneuver") { id: Int, index: Int, promise: Promise -> promise.settle { DemoSdk.maneuver(id, index) } }.runOnQueue(Queues.MAIN)
        AsyncFunction("updateNavigation") { id: Int, fix: DemoLocationRecord, promise: Promise -> promise.settle { DemoSdk.updateNavigation(id, fix) } }.runOnQueue(Queues.MAIN)
        AsyncFunction("releaseRoute") { id: Int, promise: Promise -> promise.settle { DemoSdk.releaseRoute(id); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("startLocationUpdates") { promise: Promise -> location.start(appContext, promise) }.runOnQueue(Queues.MAIN)
        AsyncFunction("stopLocationUpdates") { promise: Promise -> promise.settle { location.stop(); null } }.runOnQueue(Queues.MAIN)

        View(GLMapDemoView::class) {
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
            AsyncFunction("pickMapObject") { view: GLMapDemoView, x: Double, y: Double, distance: Double, promise: Promise -> view.settle(promise) { view.pickMapObject(x, y, distance) } }
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
