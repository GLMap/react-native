package software.globus.reactnative.glroute
import software.globus.reactnative.core.*

import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import expo.modules.kotlin.jni.NativeArrayBuffer
import java.nio.ByteOrder
import expo.modules.kotlin.Promise
import globus.glmap.*
import globus.glroute.*
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.util.UUID
import kotlin.concurrent.thread

internal object RouteSdk {
    private class Request(val promise:Promise,var cancel:()->Unit={})
    private val requests=mutableMapOf<Int,Request>()
    private val main=Handler(Looper.getMainLooper())
    private val routes=mutableMapOf<Int,GLRoute>()
    private val trackers=mutableMapOf<Int,GLRouteTracker>()
    private fun begin(id: Int, promise: Promise): Request? {
        if (requests.containsKey(id)) { promise.reject(DemoFailure.invalid("Request $id is already running")); return null }
        return Request(promise).also { requests[id] = it }
    }
    private fun finish(id: Int, entry: Request): Promise? =
        if (requests[id] === entry) requests.remove(id)?.promise else null
    fun cancelRequest(id: Int) {
        val request = requests.remove(id) ?: return
        request.cancel()
        request.promise.reject(DemoFailure.cancelled())
    }

    fun route(context: Context, id: Int, query: DemoRouteQueryRecord, promise: Promise) {
        if (query.points.size < 2 || !query.points.all { it.isValid }) { promise.reject(DemoFailure.invalid("A route needs two valid points")); return }
        val request = GLRouteRequest()
        try {
            when (query.mode) {
                "car" -> request.setAutoWithOptions(CostingOptions.Auto())
                "bicycle" -> request.setBicycleWithOptions(CostingOptions.Bicycle())
                "pedestrian" -> request.setPedestrianWithOptions(CostingOptions.Pedestrian())
                else -> throw DemoFailure.invalid("Unknown route mode ${query.mode}")
            }
            request.locale = "en-US"
            request.unitSystem = GLMapLocaleSettings.UnitSystem.International
            query.points.forEach { request.addPoint(GLRoutePoint(it.native, Double.NaN, GLRoutePoint.Type.BREAK)) }
            val config = if (query.offline) context.assets.open("valhalla.json").use { it.readBytes().toString(Charsets.UTF_8) } else null
            val entry = begin(id, promise) ?: run { request.close(); return }
            val callback = object : GLRouteRequest.ResultsCallback {
                override fun onResult(route: GLRoute) {
                    main.post {
                        request.close()
                        val reply = finish(id, entry)
                        if (reply == null) route.close() else reply.settle { store(route) }
                    }
                }
                override fun onError(error: GLMapError) { main.post { request.close(); finish(id, entry)?.reject(DemoFailure.of(error)) } }
            }
            val native = if (config != null) request.startOffline(config, callback) else request.startOnline(callback)
            entry.cancel = { GLRouteRequest.cancel(native) }
        } catch (error: Exception) {
            request.close()
            requests.remove(id)
            promise.reject(DemoFailure.of(error))
        }
    }
    private fun store(route: GLRoute): Map<String, Any?> {
        val id = CoreResources.addTrack(object:NativeTrackSource {
            override fun trackData(color:Int)=route.getTrackData(color)
            override fun line(index:Int):NativeLine {
                val maneuvers=route.maneuvers
                try { val value=maneuvers.getOrNull(index) ?: throw DemoFailure.notFound("Maneuver $index is unavailable")
                    return NativeLine(value.line,value.lineStartIndex)
                } finally { maneuvers.forEach { it.close() } }
            }
        })
        routes[id] = route
        val bounds = route.getTrackData(0).use { it.bBox.record() }
        return mapOf("id" to id, "distance" to route.length, "duration" to route.duration, "bounds" to bounds, "maneuverCount" to route.maneuvers.size)
    }
    fun buildRoute(steps: List<DemoRouteStepRecord>, buffer: NativeArrayBuffer, counts: List<Int>): Map<String, Any?> {
        val coordinates = buffer.demoLines(counts)
        if (coordinates.size != steps.size) throw DemoFailure.invalid("One line per route step is required")
        if (steps.isEmpty() || !coordinates.all { it.size >= 4 && it.size % 2 == 0 && it.all(Double::isFinite) } || !steps.all { it.duration.isFinite() && it.duration >= 0 })
            throw DemoFailure.invalid("Every route step needs two points and a duration")
        val turns = mapOf("continue" to GLRouteManeuver.Type.Continue, "left" to GLRouteManeuver.Type.Left, "right" to GLRouteManeuver.Type.Right)
        return GLRouteBuilder().use { builder ->
            builder.setLanguage("en")
            val first = coordinates.first(); val last = coordinates.last()
            val finish = MapGeoPoint(last[last.size - 1], last[last.size - 2])
            builder.addTargetPoint(GLRoutePoint(MapGeoPoint(first[1], first[0]), Double.NaN, GLRoutePoint.Type.BREAK))
            builder.addTargetPoint(GLRoutePoint(finish, Double.NaN, GLRoutePoint.Type.BREAK))
            steps.zip(coordinates).forEach { (step, line) ->
                val turn = turns[step.turn] ?: throw DemoFailure.invalid("Unknown turn ${step.turn}")
                builder.addManeuver(turn, Array(line.size / 2) { MapPoint.CreateFromGeoCoordinates(line[2 * it + 1], line[2 * it]) }, null)
                builder.setManeuverShortInstruction(step.instruction)
                builder.setManeuverTime(step.duration)
            }
            builder.addManeuver(GLRouteManeuver.Type.Destination, arrayOf(MapPoint(finish)), null)
            builder.setManeuverShortInstruction("Arrive at destination")
            store(builder.build() ?: throw DemoFailure.sdk("GLRouteBuilder returned no route"))
        }
    }
    fun route(id: Int) = routes[id] ?: throw DemoFailure.notFound("Route $id has been released")
    fun routeCoordinates(id: Int): List<Double> {
        val raw = route(id).trackCoordinates ?: return emptyList()
        return (raw.indices step 2).flatMap { index -> MapGeoPoint(MapPoint(raw[index].toDouble(), raw[index + 1].toDouble())).let { listOf(it.lon, it.lat) } }
    }
    private fun record(maneuver: GLRouteManeuver): Map<String, Any?> {
        val start = MapGeoPoint(maneuver.startPoint)
        return mapOf("index" to maneuver.index, "type" to maneuver.type, "instruction" to maneuver.shortInstruction.orEmpty(), "latitude" to start.lat, "longitude" to start.lon)
    }
    fun maneuver(id: Int, index: Int) = route(id).maneuvers.getOrNull(index)?.let(::record)
    fun updateNavigation(id: Int, location: DemoLocationRecord): Map<String, Any?> {
        val route = route(id)
        if (!location.point.isValid) throw DemoFailure.invalid("Invalid location")
        val tracker = trackers.getOrPut(id) { GLRouteTracker(route).apply { currentTargetPointIndex = 1 } }
        val maneuver = tracker.updateLocation(location.latitude, location.longitude, location.bearing?.toFloat() ?: Float.NaN)
        val point = if (tracker.isOnRoute) MapGeoPoint(tracker.locationOnRoute) else location.point.native
        return mapOf("maneuver" to maneuver?.let(::record), "distanceToManeuver" to tracker.distanceToNextManeuver, "remainingDistance" to tracker.remainingDistance,
            "remainingDuration" to tracker.remainingDuration, "progress" to tracker.progressIndex, "onRoute" to tracker.isOnRoute,
            "latitude" to point.lat, "longitude" to point.lon)
    }
    fun releaseRoute(id: Int) { CoreResources.removeTrack(id); trackers.remove(id)?.close(); routes.remove(id)?.close() }

    fun detach() {
        val pending=requests.values.toList();requests.clear()
        pending.forEach { it.cancel();it.promise.reject(DemoFailure.disposed()) }
        routes.keys.toList().forEach(::releaseRoute)
    }
}
