package software.globus.reactnative.glroute

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
class GLRouteModule:Module() {
    private val context:Context get()=appContext.reactContext ?: throw DemoFailure.disposed()
    override fun definition()=ModuleDefinition {
        Name("GLRoute")
        OnDestroy { Handler(Looper.getMainLooper()).post { RouteSdk.detach() } }
        AsyncFunction("route") { id: Int, query: DemoRouteQueryRecord, promise: Promise ->
            try { RouteSdk.route(context, id, query, promise) } catch (error: DemoFailure) { promise.reject(error) }
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("buildRoute") { steps: List<DemoRouteStepRecord>, coordinates: NativeArrayBuffer, counts: List<Int>, promise: Promise -> promise.settle { RouteSdk.buildRoute(steps, coordinates, counts) } }.runOnQueue(Queues.MAIN)
        AsyncFunction("routeCoordinates") { id: Int, promise: Promise -> promise.settle { RouteSdk.routeCoordinates(id) } }.runOnQueue(Queues.MAIN)
        AsyncFunction("maneuver") { id: Int, index: Int, promise: Promise -> promise.settle { RouteSdk.maneuver(id, index) } }.runOnQueue(Queues.MAIN)
        AsyncFunction("updateNavigation") { id: Int, fix: DemoLocationRecord, promise: Promise -> promise.settle { RouteSdk.updateNavigation(id, fix) } }.runOnQueue(Queues.MAIN)
        AsyncFunction("releaseRoute") { id: Int, promise: Promise -> promise.settle { RouteSdk.releaseRoute(id); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("cancelRequest") { id: Int, promise: Promise -> promise.settle { RouteSdk.cancelRequest(id); null } }.runOnQueue(Queues.MAIN)
    }
}
