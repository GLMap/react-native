package software.globus.reactnative.testsupport

import expo.modules.kotlin.jni.NativeArrayBuffer

import android.content.Context
import android.graphics.*
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.MotionEvent
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import globus.glmap.*
import org.json.JSONObject

class CameraRecord : Record {
    @Field var latitude: Double = 0.0
    @Field var longitude: Double = 0.0
    @Field var zoom: Double = 5.0
    @Field var angle: Double = 0.0
    @Field var pitch: Double = 0.0
}

class GLMapTestSupportModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("GLMapTestSupport")
        AsyncFunction("saveBenchmarkResults") { json: String ->
            val context = requireNotNull(appContext.reactContext)
            val file = java.io.File(context.getExternalFilesDir(null), "react-native-benchmark.json")
            file.writeText(json)
            file.absolutePath
        }
        AsyncFunction("saveResults") { json: String ->
            val context = requireNotNull(appContext.reactContext)
            val file = java.io.File(context.getExternalFilesDir(null), "react-native-results.json")
            file.writeText(json)
            file.absolutePath
        }
        AsyncFunction("saveLifecycleResults") { json: String ->
            val context = requireNotNull(appContext.reactContext)
            val file = java.io.File(context.getExternalFilesDir(null), "react-native-lifecycle.json")
            file.writeText(json)
            file.absolutePath
        }
        View(GLMapTestSupportView::class) {
            Events("onReady", "onMapTap", "onFailure")
            Prop("fixture") { view: GLMapTestSupportView, value: String -> view.configure(value) }
            AsyncFunction("captureState") { view: GLMapTestSupportView, promise: Promise -> view.capture(promise) }
            AsyncFunction("setCamera") { view: GLMapTestSupportView, value: CameraRecord -> view.camera(value) }
            AsyncFunction("createVectorLayer") { view: GLMapTestSupportView, order: Int, promise: Promise -> view.createLayer(order, promise) }
            AsyncFunction("mutateVectorLayer") { view: GLMapTestSupportView, id: Int, operation: String, coordinates: DoubleArray?, json: String?, style: String?, promise: Promise ->
                view.mutate(id, operation, coordinates, json, style, promise)
            }
            AsyncFunction("diagnostics") { view: GLMapTestSupportView -> view.diagnostics() }
            AsyncFunction("benchEcho") { view: GLMapTestSupportView, sequence: Int -> view.bench().echo(sequence) }
            AsyncFunction("benchPayload") { view: GLMapTestSupportView, values: DoubleArray -> view.bench().payload(values) }
            AsyncFunction("benchGeometry") { view: GLMapTestSupportView, values: DoubleArray -> view.bench().geometry(values) }
            AsyncFunction("benchPayloadBuffer") { view: GLMapTestSupportView, values: NativeArrayBuffer -> view.bench().payloadBuffer(values) }
            AsyncFunction("benchGeometryBuffer") { view: GLMapTestSupportView, values: NativeArrayBuffer -> view.bench().geometryBuffer(values) }
            AsyncFunction("benchNative") { view: GLMapTestSupportView, count: Int -> view.bench().native(count) }
            AsyncFunction("benchRestyle") { view: GLMapTestSupportView, alternate: Boolean -> view.bench().restyle(alternate) }
            AsyncFunction("benchStatus") { view: GLMapTestSupportView -> view.bench().status() }
            AsyncFunction("benchReadback") { view: GLMapTestSupportView -> view.bench().readback() }
            AsyncFunction("dispose") { view: GLMapTestSupportView -> view.dispose() }
            OnViewDestroys { view: GLMapTestSupportView -> view.dispose() }
        }
    }
}

class GLMapTestSupportView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val main = Handler(Looper.getMainLooper())
    private val onReady by EventDispatcher()
    private val onMapTap by EventDispatcher()
    private val onFailure by EventDispatcher()
    private val initializationResult = GLMapManager.Initialize(context.applicationContext, "", null)
    private val map = GLMapTextureView(context)
    private val marker = GLMapImage(2)
    private val fixtureLayer = GLMapVectorLayer(1)
    private var configured = false
    private var disposed = false
    private var nextLayer = 0
    private var taps = 0
    private var moves = 0
    private val pending = mutableSetOf<Promise>()
    private class Layer(val native: GLMapVectorLayer) {
        var objects: GLMapVectorObjectList? = null
        fun close() { objects?.close(); objects = null; native.close() }
    }
    private val layers = mutableMapOf<Int, Layer>()
    private var benchmark: MapBenchmark? = null
    fun bench(): MapBenchmark {
        checkOpen()
        return benchmark ?: MapBenchmark(map).also { benchmark = it }
    }

    init {
        map.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        map.contentDescription = "Benchmark map"
        addView(map)
        val detector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent) = true
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                if (!disposed) {
                    taps++
                    // React Native coordinates are logical pixels, as are UIKit points.
                    val density = resources.displayMetrics.density
                    onMapTap(mapOf("x" to e.x / density, "y" to e.y / density, "count" to taps))
                }
                return true
            }
        })
        map.setOnTouchListener { _, event -> detector.onTouchEvent(event); false }
        map.renderer.setMapDidMoveCallback { main.post { if (!disposed) moves++ } }
    }
    private fun checkOpen() { check(!disposed) { "map_disposed" } }
    private fun settle(promise: Promise, value: Any?) { if (pending.remove(promise)) promise.resolve(value) }

    fun configure(source: String) {
        if (configured || disposed) return
        try {
            val fixture = JSONObject(source)
            val c = fixture.getJSONObject("camera")
            camera(CameraRecord().apply { latitude = c.getDouble("latitude"); longitude = c.getDouble("longitude"); zoom = c.getDouble("zoom") })
            GLMapVectorObject.createFromGeoJSONOrThrow(fixture.getJSONObject("track").toString()).use { objects ->
                checkNotNull(GLMapVectorCascadeStyle.createStyle("line{width:4pt;color:#E74C3C;}")).use { style ->
                    fixtureLayer.setVectorObjects(objects, style, null)
                }
            }
            map.renderer.add(fixtureLayer)
            val point = fixture.getJSONObject("marker")
            val size = (24 * resources.displayMetrics.density).toInt()
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            paint.color = Color.WHITE; canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
            paint.color = Color.rgb(38, 80, 214); canvas.drawCircle(size / 2f, size / 2f, size * .36f, paint)
            marker.setBitmap(bitmap); marker.setOffset(size / 2, size / 2)
            marker.position = MapPoint.CreateFromGeoCoordinates(point.getDouble("latitude"), point.getDouble("longitude"))
            map.renderer.add(marker)
            configured = true
            map.renderer.doWhenSurfaceCreated { main.post { if (!disposed) onReady(mapOf("surfaceAvailable" to map.isAvailable)) } }
        } catch (error: Exception) { onFailure(mapOf("message" to error.toString())) }
    }
    fun camera(value: CameraRecord) {
        checkOpen()
        require(listOf(value.latitude, value.longitude, value.zoom, value.angle, value.pitch).all { it.isFinite() }
            && value.latitude in -90.0..90.0 && value.longitude in -180.0..180.0
            && value.pitch in 0.0..45.0 && value.angle.toFloat().isFinite()) { "invalid_camera" }
        map.renderer.setMapGeoCenterLatLon(value.latitude, value.longitude)
        map.renderer.mapZoom = value.zoom
        map.renderer.mapAngle = value.angle.toFloat()
        map.renderer.mapPitch = value.pitch.toFloat()
    }
    fun capture(promise: Promise) {
        checkOpen()
        check(map.isAvailable) { "map_unavailable" }
        pending.add(promise)
        map.renderer.captureState { state ->
            val value = state.use {
                val center = it.getGeoCenter(MapGeoPoint())
                val origin = it.getOrigin(PointF())
                mapOf("latitude" to center.lat, "longitude" to center.lon, "zoom" to it.zoom, "scale" to it.scale,
                    "angle" to it.angle.toDouble(), "pitch" to it.pitch.toDouble(), "originX" to origin.x.toDouble(), "originY" to origin.y.toDouble())
            }
            main.post { settle(promise, value) }
        }
    }
    fun createLayer(order: Int, promise: Promise) {
        checkOpen()
        val id = ++nextLayer
        val layer = Layer(GLMapVectorLayer(order)); layers[id] = layer
        pending.add(promise)
        map.renderer.add(layer.native)
        map.renderer.doWhenSurfaceCreated { main.post { settle(promise, id) } }
    }
    fun mutate(id: Int, operation: String, coordinates: DoubleArray?, json: String?, source: String?, promise: Promise) {
        checkOpen()
        val entry = checkNotNull(layers[id]) { "layer_removed" }
        if (operation == "remove") {
            layers.remove(id); map.renderer.remove(entry.native); entry.close(); promise.resolve("removed"); return
        }
        require(operation == "replace" || operation == "style") { "invalid_operation" }
        val style = GLMapStyleParser().use { parser ->
            require(parser.parseNextString(requireNotNull(source))) { "invalid_style" }
            checkNotNull(parser.finish()) { "invalid_style" }
        }
        style.use {
            val replacing = operation == "replace"
            val objects = if (replacing) geometry(coordinates, json) else checkNotNull(entry.objects) { "missing_geometry" }
            pending.add(promise)
            try {
                entry.native.setVectorObjects(objects, style) { outcome ->
                    val result = when (outcome) {
                        GLMapVectorLayer.UpdateResult.Ready -> "ready"
                        GLMapVectorLayer.UpdateResult.Superseded -> "superseded"
                        GLMapVectorLayer.UpdateResult.Cancelled -> "cancelled"
                        else -> "failed"
                    }
                    main.post { settle(promise, result) }
                }
            } catch (error: Exception) { pending.remove(promise); if (replacing) objects.close(); throw error }
            if (replacing) { entry.objects?.close(); entry.objects = objects }
        }
    }
    private fun geometry(coordinates: DoubleArray?, json: String?): GLMapVectorObjectList {
        require((coordinates == null) != (json == null)) { "invalid_geometry" }
        if (json != null) return GLMapVectorObject.createFromGeoJSONOrThrow(json)
        val values = checkNotNull(coordinates)
        require(values.size % 2 == 0 && values.size != 2) { "invalid_geometry" }
        val objects = GLMapVectorObjectList()
        try {
            if (values.isNotEmpty()) GeometryBuilder().use { builder ->
                builder.addLineLonLat(values)
                checkNotNull(builder.build()).use { objects.insertObject(0, it) }
            }
            return objects
        } catch (error: Exception) { objects.close(); throw error }
    }
    fun diagnostics(): Map<String, Any?> {
        checkOpen()
        return mapOf("surfaceAvailable" to map.isAvailable, "width" to width, "height" to height,
            "initializationResult" to initializationResult, "taps" to taps, "moves" to moves,
            "layers" to layers.map { (id, entry) -> mapOf("id" to id, "count" to (entry.objects?.size() ?: 0L),
                "geoJson" to entry.objects?.let { if (it.size() > 0) it.get(0).use { obj -> obj.asGeoJSON() } else null }) })
    }
    fun dispose() {
        if (disposed) return
        disposed = true
        benchmark?.dispose(); benchmark = null
        pending.toList().forEach { it.reject("map_disposed", "The map has been removed", null) }; pending.clear()
        map.setOnTouchListener(null)
        layers.values.forEach { map.renderer.remove(it.native); it.close() }; layers.clear()
        map.renderer.remove(marker); map.renderer.remove(fixtureLayer)
        map.dispose(); marker.close(); fixtureLayer.close()
    }
}
