package software.globus.reactnative.glmap
import software.globus.reactnative.core.*

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Point
import android.graphics.PointF
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.MotionEvent
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.jni.NativeArrayBuffer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.viewevent.ViewEventCallback
import expo.modules.kotlin.views.ExpoView
import globus.glmap.*
import java.io.IOException
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.thread
import kotlin.concurrent.withLock
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.sin

private class DemoMarker(val index: Int, val point: MapPoint)

private class DemoPins(val variants: List<Bitmap>) : GLMapImageGroupCallback {
    private val lock = ReentrantLock()
    private var pins = emptyList<Pair<MapPoint, Int>>()
    fun set(values: List<Pair<MapPoint, Int>>) = lock.withLock { pins = values }
    override fun getImageVariantsCount() = variants.size
    override fun getImageVariantBitmap(i: Int) = variants[i]
    override fun getImageVariantOffset(i: Int) = MapPoint(variants[i].width / 2.0, 0.0)
    override fun getImagesCount() = pins.size
    override fun getImageIndex(i: Int) = pins[i].second
    override fun getImagePos(i: Int) = pins[i].first
    override fun updateStarted() = lock.lock()
    override fun updateFinished() = lock.unlock()
}

private class DemoDrawable(val objects: List<GLMapDrawObject>) {
    val keep = mutableListOf<AutoCloseable>()
    var animation: GLMapAnimation? = null
    var style: GLMapVectorStyle? = null
    var trackData: GLMapTrackData? = null
    var line: GLMapVectorObject? = null
    var pins: DemoPins? = null
    var markers = emptyList<DemoMarker>()
    var vectorObjects: GLMapVectorObjectList? = null
    var userLocation = false
    fun close() {
        animation?.cancel(false)
        objects.forEach { it.close() }
        (keep + listOfNotNull(style, trackData, line, vectorObjects)).forEach { it.close() }
    }
}

@SuppressLint("ViewConstructor")
class GLMapDemoView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val main = Handler(Looper.getMainLooper())
    private val onMapReady by EventDispatcher()
    private val onMapTap by EventDispatcher()
    private val onMapLongPress by EventDispatcher()
    private val map: GLMapTextureView
    private val renderer get() = map.renderer
    private val density = resources.displayMetrics.density
    val queryId=CoreResources.registerMap(object:NativeMapSource {
        override val density get()=this@GLMapDemoView.density.toDouble()
        override fun state()=if(disposed || !map.isAvailable) null else renderer.state
    })
    private var disposed = false
    private val visibleInsets = Rect()
    private var raster: GLMapRasterTileSource? = null
    private var cameraAnimation: GLMapAnimation? = null
    private val drawables = mutableMapOf<Int, DemoDrawable>()
    private var lastDrawable = 0
    private val pending = mutableSetOf<Promise>()

    init {
        CoreSdk.ensureInitialized(context)
        map = GLMapTextureView(context)
        map.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        addView(map)
        val detector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent) = true
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean { touch(e, onMapTap); return true }
            override fun onLongPress(e: MotionEvent) = touch(e, onMapLongPress)
        })
        map.setOnTouchListener { _, event -> detector.onTouchEvent(event); false }
        runCatching { setStyleOptions(emptyMap()) }
        renderer.doWhenSurfaceCreated { main.post { if (!disposed) onMapReady(emptyMap<String, Any>()) } }
    }
    private fun touch(event: MotionEvent, dispatch: ViewEventCallback<Map<String, Any>>) {
        if (disposed) return
        val geo = MapGeoPoint(renderer.convertDisplayToInternal(event.x.toDouble(), event.y.toDouble()))
        // React Native coordinates are logical pixels, as are UIKit points.
        dispatch(mapOf("x" to event.x / density, "y" to event.y / density, "latitude" to geo.lat, "longitude" to geo.lon))
    }

    /** Settles `promise` with the result of `body`, or with `disposed` once the view is gone. */
    fun settle(promise: Promise, body: () -> Any?) { if (disposed) promise.reject(DemoFailure.disposed()) else promise.settle(body) }

    // Map

    fun setStyleOptions(options: Map<String, String>) {
        // Root assets resolve images referenced by drawable styles, e.g. fill-image.
        val parser = GLMapStyleParser { name ->
            try { context.assets.open("DefaultStyle.bundle/$name").use { it.readBytes() } }
            catch (_: IOException) { try { context.assets.open(name).use { it.readBytes() } } catch (_: IOException) { null } }
        }
        parser.use {
            it.setOptions(options, true)
            val style = it.parseFromResources() ?: throw DemoFailure.sdk("Cannot parse the map style: ${it.error?.message.orEmpty()}")
            style.use(renderer::setStyle)
        }
        renderer.reloadTiles()
    }
    fun setTileSource(source: DemoRasterRecord?) {
        val next = source?.let { record ->
            val templates = record.urlTemplates
            if (templates.isEmpty() || record.cacheName.isEmpty() || record.cacheName.contains('/') ||
                !templates.all { url -> url.startsWith("https://") && listOf("{z}", "{x}", "{y}").all(url::contains) }) throw DemoFailure.invalid("Invalid raster tile source")
            val cache = GLMapFileStorage(context.filesDir).findStorage("RasterCache", true)?.findFile(record.cacheName, true)
            object : GLMapRasterTileSource(cache) {
                override fun urlForTilePos(x: Int, y: Int, z: Int) =
                    templates[Math.floorMod(x + y, templates.size)].replace("{z}", "$z").replace("{x}", "$x").replace("{y}", "$y")
            }.apply { setValidZoomMask((1 shl 20) - 1); setAttributionText(record.attribution) }
        }
        renderer.setBase(next ?: GLMapVectorTileSource())
        raster?.close()
        raster = next
    }
    fun setOptions(options: DemoMapOptionsRecord) {
        options.altitudeScale?.let {
            if (it !in 0.0..10.0) throw DemoFailure.invalid("altitudeScale must be within 0...10")
            renderer.altitudeScale = it.toFloat()
        }
        options.hillshades?.let { renderer.drawHillshades = it }
        options.elevationLines?.let { renderer.drawElevationLines = it }
        options.slopes?.let { renderer.drawSlopes = it }
        options.visibleInsets?.let {
            visibleInsets.set((it.left * density).toInt(), (it.top * density).toInt(), (it.right * density).toInt(), (it.bottom * density).toInt())
            renderer.setVisibleMapInsets(visibleInsets.left, visibleInsets.top, visibleInsets.right, visibleInsets.bottom)
        }
        options.origin?.let { renderer.setMapOrigin(it.x.toFloat(), it.y.toFloat()) }
        options.clipping?.let {
            if (!it.bounds.isValid) throw DemoFailure.invalid("Invalid clipping bounds")
            renderer.enableClipping(it.bounds.native, it.minLevel.toFloat(), it.maxLevel.toFloat())
        }
    }
    fun reloadTiles() = renderer.reloadTiles()

    fun captureState(promise: Promise) {
        if (disposed || !map.isAvailable) { promise.reject(DemoFailure.disposed()); return }
        pending.add(promise)
        renderer.captureState { state ->
            val value = state.use {
                val center = it.getGeoCenter(MapGeoPoint()); val origin = it.getOrigin(PointF())
                mapOf("latitude" to center.lat, "longitude" to center.lon, "zoom" to it.zoom, "scale" to it.scale,
                    "angle" to it.angle.toDouble(), "pitch" to it.pitch.toDouble(), "originX" to origin.x.toDouble(), "originY" to origin.y.toDouble())
            }
            main.post { if (pending.remove(promise)) promise.resolve(value) }
        }
    }

    fun moveCamera(update: DemoCameraRecord, animation: DemoAnimationRecord?) {
        val numbers = listOfNotNull(update.zoom, update.angle, update.pitch, update.zoomDelta, animation?.duration)
        if (listOfNotNull(update.center, update.visibleCenter).any { !it.isValid } || update.bounds?.isValid == false ||
            !numbers.all(Double::isFinite) || update.angle?.toFloat()?.isFinite() == false ||
            update.pitch?.let { it !in 0.0..45.0 } == true || (animation?.duration ?: 0.0) < 0) throw DemoFailure.invalid("Invalid camera update")
        val apply = {
            update.bounds?.let {
                val box = it.native
                val zoom = renderer.mapZoomForBBox(box)
                renderer.mapZoom = if (zoom.isFinite()) zoom + (update.zoomDelta ?: 0.0) else 15.0
                centerVisibleArea(box.center())
            }
            update.zoom?.let { renderer.mapZoom = it }
            update.center?.let { renderer.setMapGeoCenterLatLon(it.latitude, it.longitude) }
            update.visibleCenter?.let { centerVisibleArea(MapPoint.CreateFromGeoCoordinates(it.latitude, it.longitude)) }
            update.angle?.let { renderer.mapAngle = it.toFloat() }
            update.pitch?.let { renderer.mapPitch = it.toFloat() }
        }
        if (animation == null) { apply(); return }
        cameraAnimation?.cancel(false)
        cameraAnimation = renderer.animate { native ->
            animation.duration?.let(native::setDuration)
            animation.flyTo?.let { native.flyToMode = if (it) GLMapAnimation.FlyToMode.Enabled else GLMapAnimation.FlyToMode.Disabled }
            if (animation.linear == true) native.setTransition(GLMapAnimation.Linear)
            apply()
        }
    }
    /** Insets constrain the fitted zoom but do not move the camera. */
    private fun centerVisibleArea(point: MapPoint) {
        val origin = renderer.mapOrigin
        val delta = renderer.convertDisplayDeltaToInternal(
            (visibleInsets.right - visibleInsets.left) * 0.5 + map.width * (0.5 - origin.x),
            (visibleInsets.bottom - visibleInsets.top) * 0.5 + map.height * (0.5 - origin.y),
            renderer.mapZoom, renderer.mapAngle, MapPoint())
        renderer.mapCenter = MapPoint(point).add(delta)
    }
    fun project(coordinates: DoubleArray): List<Double> {
        if (coordinates.size % 2 != 0) throw DemoFailure.invalid("Expected longitude/latitude pairs")
        return (coordinates.indices step 2).flatMap { index ->
            val point = renderer.convertInternalToDisplay(MapPoint.CreateFromGeoCoordinates(coordinates[index + 1], coordinates[index]))
            listOf((point.x / density).toDouble(), (point.y / density).toDouble())
        }
    }
    // Drawables

    private fun color(value: String): Int {
        val digits = value.removePrefix("#")
        val number = digits.toLongOrNull(16)
        if (!value.startsWith("#") || (digits.length != 6 && digits.length != 8) || number == null) throw DemoFailure.invalid("Expected #RRGGBB or #RRGGBBAA, got $value")
        val rgba = if (digits.length == 6) number shl 8 or 0xFF else number
        return Color.argb((rgba and 0xFF).toInt(), (rgba shr 24 and 0xFF).toInt(), (rgba shr 16 and 0xFF).toInt(), (rgba shr 8 and 0xFF).toInt())
    }
    private fun image(source: DemoImageRecord): Bitmap {
        if (source.svg.contains('/')) throw DemoFailure.notFound("Asset ${source.svg} is not bundled")
        if (!source.scale.isFinite() || source.scale <= 0) throw DemoFailure.invalid("Image scale must be positive")
        val scale = renderer.screenScale * source.scale
        val transform = source.tint?.let { SVGRender.transform(scale, color(it)) } ?: SVGRender.transform(scale)
        try { context.assets.open(source.svg).close() } catch (_: IOException) { throw DemoFailure.notFound("Asset ${source.svg} is not bundled") }
        return SVGRender.render(context.assets, source.svg, transform) ?: throw DemoFailure.sdk("Cannot render ${source.svg}")
    }
    private fun vectorStyle(css: String) = GLMapVectorStyle.createStyle(css) ?: throw DemoFailure.invalid("Invalid style $css")
    private fun add(drawable: DemoDrawable): Int {
        drawables[++lastDrawable] = drawable
        drawable.objects.forEach(renderer::add)
        return lastDrawable
    }
    private fun drawable(id: Int) = drawables[id] ?: throw DemoFailure.notFound("Drawable $id has been removed")
    private inline fun <reified T> target(id: Int): Pair<DemoDrawable, T> {
        val drawable = drawable(id)
        return drawable to (drawable.objects.firstOrNull() as? T ?: throw DemoFailure.invalid("Drawable $id is not a ${T::class.simpleName}"))
    }
    fun setHidden(id: Int, hidden: Boolean) = drawable(id).objects.forEach { it.isHidden = hidden }
    fun removeDrawable(id: Int) {
        val drawable = drawables.remove(id) ?: return
        drawable.objects.forEach(renderer::remove)
        drawable.close()
    }

    fun addImage(options: DemoImageOptionsRecord): Int {
        if (options.anchor != "center" && options.anchor != "bottom") throw DemoFailure.invalid("Unknown anchor ${options.anchor}")
        val bitmap = image(options.image)
        val native = GLMapImage(options.drawOrder)
        native.setBitmap(bitmap)
        native.setOffset(bitmap.width / 2, if (options.anchor == "center") bitmap.height / 2 else 0)
        native.position = MapPoint.CreateFromGeoCoordinates(options.latitude, options.longitude)
        native.scale = options.scale
        native.isHidden = options.hidden
        return add(DemoDrawable(listOf(native)))
    }
    fun updateImage(id: Int, change: DemoImageChangeRecord, duration: Double) {
        val (drawable, native) = target<GLMapImage>(id)
        val latitude = change.latitude; val longitude = change.longitude
        if ((latitude == null) != (longitude == null) || !duration.isFinite() || duration < 0) throw DemoFailure.invalid("Invalid image change")
        val position = if (latitude != null && longitude != null) MapPoint.CreateFromGeoCoordinates(latitude, longitude) else null
        drawable.animation?.cancel(false)
        drawable.animation = if (duration > 0) renderer.animate { animation ->
            animation.setDuration(duration)
            position?.let { animation.setPosition(native, it) }
            change.scale?.let { animation.setScale(native, it) }
        } else null
        if (duration == 0.0) {
            position?.let { native.position = it }
            change.scale?.let { native.scale = it }
        }
    }
    fun addImageGroup(options: DemoImageGroupRecord): Int {
        if (options.images.isEmpty()) throw DemoFailure.invalid("An image group needs images")
        val pins = DemoPins(options.images.map(::image))
        return add(DemoDrawable(listOf(GLMapImageGroup(pins, options.drawOrder))).also { it.pins = pins })
    }
    fun setImageGroupPins(id: Int, pins: DoubleArray) {
        val (drawable, group) = target<GLMapImageGroup>(id)
        val source = drawable.pins
        if (source == null || pins.size % 3 != 0) throw DemoFailure.invalid("Expected longitude/latitude/image triples")
        source.set((pins.indices step 3).map { index ->
            val variant = pins[index + 2].toInt()
            if (variant.toDouble() != pins[index + 2] || variant !in source.variants.indices) throw DemoFailure.invalid("Unknown image index")
            MapPoint.CreateFromGeoCoordinates(pins[index + 1], pins[index]) to variant
        })
        group.setNeedsUpdate(false)
    }

    fun addMarkerLayer(options: DemoMarkerLayerRecord, pointsBuffer: NativeArrayBuffer?, promise: Promise) {
        if (disposed) { promise.reject(DemoFailure.disposed()); return }
        try {
            val points = pointsBuffer?.demoDoubles(); val asset = options.markers.asset
            if (options.images.isEmpty() || (asset == null) == (points == null)) throw DemoFailure.invalid("A marker layer needs images and one marker source")
            if (asset?.contains('/') == true) throw DemoFailure.notFound("Asset $asset is not bundled")
            if (points != null && points.size % 2 != 0) throw DemoFailure.invalid("Expected longitude/latitude pairs")
            val bitmaps = options.images.map(::image)
            val text = vectorStyle("{text-color:black;font-size:12;font-stroke-width:1pt;font-stroke-color:#FFFFFFEE;}")
            val styles = GLMapMarkerStyleCollection()
            bitmaps.forEachIndexed { index, bitmap -> styles.addStyle(GLMapMarkerImage("marker$index", bitmap)) }
            val labelKey = options.labelKey; val clustered = options.clustered
            styles.setDataCallback(object : GLMapMarkerStyleCollectionDataCallback() {
                override fun getLocation(marker: Any) = (marker as? DemoMarker)?.point ?: (marker as GLMapVectorObject).point()
                override fun fillUnionData(markersCount: Int, nativeMarker: Long) {
                    if (!clustered) return
                    GLMapMarkerStyleCollection.setMarkerStyle(nativeMarker, (ln(markersCount.toDouble()) / ln(2.0)).toInt().coerceIn(0, bitmaps.size - 1))
                    GLMapMarkerStyleCollection.setMarkerText(nativeMarker, markersCount.toString(), GLMapTextAlignment.Undefined, Point(0, 0), text)
                }
                override fun fillData(marker: Any, nativeMarker: Long) {
                    GLMapMarkerStyleCollection.setMarkerStyle(nativeMarker, 0)
                    if (labelKey == null || marker !is GLMapVectorObject) return
                    marker.valueForKey(labelKey)?.use { value ->
                        value.string?.let { GLMapMarkerStyleCollection.setMarkerText(nativeMarker, it, GLMapTextAlignment.Undefined, Point(0, 8), text) }
                    }
                }
            })
            val radius = if (clustered) bitmaps.maxOf { it.width } / renderer.screenScale / 2.0 else 0.0
            if (points != null) {
                val markers = (points.indices step 2).map { DemoMarker(it / 2, MapPoint.CreateFromGeoCoordinates(points[it + 1], points[it])) }
                val box = GLMapBBox().apply { markers.forEach { addPoint(it.point) } }
                val drawable = DemoDrawable(listOf(GLMapMarkerLayer(markers.toTypedArray<Any>(), styles, radius, options.drawOrder)))
                drawable.markers = markers
                drawable.keep += listOf(styles, text)
                promise.resolve(mapOf("id" to add(drawable), "bounds" to box.record(), "count" to markers.size))
                return
            }
            pending.add(promise)
            thread(name = "GLMap demo markers") {
                val loaded = runCatching {
                    context.assets.open(asset!!).use(GLMapVectorObject::createFromGeoJSONStreamOrThrow).use { objects -> objects.toArray() to objects.bBox }
                }
                main.post {
                    val items = loaded.getOrNull()?.first.orEmpty()
                    if (!pending.remove(promise) || loaded.isFailure) {
                        (items.toList() + listOf(styles, text)).forEach { it.close() }
                        if (loaded.isFailure && !disposed) promise.reject(DemoFailure.of(loaded.exceptionOrNull()!!))
                        return@post
                    }
                    val drawable = DemoDrawable(listOf(GLMapMarkerLayer(items, styles, radius, options.drawOrder)))
                    drawable.keep += items.toList() + listOf(styles, text)
                    promise.resolve(mapOf("id" to add(drawable), "bounds" to loaded.getOrThrow().second.record(), "count" to items.size))
                }
            }
        } catch (error: Exception) { promise.reject(DemoFailure.of(error)) }
    }
    fun pickMarker(id: Int, x: Double, y: Double, distance: Double): Int? {
        val (_, layer) = target<GLMapMarkerLayer>(id)
        val point = renderer.convertDisplayToInternal(x * density, y * density)
        return layer.objectsNearPoint(renderer, point, distance)?.firstNotNullOfOrNull { it as? DemoMarker }?.index
    }
    fun swapMarkers(id: Int, show: List<Int>, hide: List<Int>) {
        val (drawable, layer) = target<GLMapMarkerLayer>(id)
        if (!(show + hide).all(drawable.markers.indices::contains)) throw DemoFailure.invalid("Unknown marker index")
        layer.modify(show.map { drawable.markers[it] }.toTypedArray<Any>(), hide.map { drawable.markers[it] }.toSet(), true, null)
    }

    private fun dp(value: Int) = (value * density).toInt()
    private fun fill(drawable: DemoDrawable, options: DemoBalloonRecord) {
        val style = vectorStyle(options.textStyle)
        val balloon = drawable.objects[0] as GLMapBalloon
        balloon.setText(options.text, style, Rect(dp(12), dp(8), dp(12), dp(8)), null)
        balloon.position = MapPoint.CreateFromGeoCoordinates(options.latitude, options.longitude)
        drawable.style?.close()
        drawable.style = style
    }
    fun addBalloon(options: DemoBalloonRecord): Int {
        val background = Bitmap.createBitmap(dp(180), dp(64), Bitmap.Config.ARGB_8888)
        Canvas(background).drawRoundRect(0f, 0f, background.width.toFloat(), background.height.toFloat(), dp(12).toFloat(), dp(12).toFloat(),
            Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE })
        val balloon = GLMapBalloon(options.drawOrder)
        val drawable = DemoDrawable(listOf(balloon))
        try {
            balloon.setBackgroundBitmap(background, Rect(dp(20), dp(20), dp(20), dp(20)))
            fill(drawable, options)
        } catch (error: Exception) { drawable.close(); throw error }
        return add(drawable)
    }
    fun updateBalloon(id: Int, change: DemoBalloonRecord) = fill(target<GLMapBalloon>(id).first, change)

    fun addTrack(options: DemoTrackRecord): Int {
        val progress = options.progressColor?.let(::color)
        val style = vectorStyle(options.style)
        val track = GLMapTrack(options.drawOrder)
        progress?.let(track::setProgressColor)
        return add(DemoDrawable(listOf(track)).also { it.style = style })
    }
    fun setTrackRoute(id: Int, routeId: Int, tint: String) {
        val (drawable, track) = target<GLMapTrack>(id)
        val data = CoreResources.track(routeId).trackData(color(tint))
        drawable.animation?.cancel(false)
        track.setProgressIndex(0.0)
        track.setData(data, drawable.style!!, null)
        drawable.trackData?.close()
        drawable.trackData = data
    }
    fun appendTrackPoint(id: Int, point: DemoGeoRecord, tint: String) {
        val (drawable, track) = target<GLMapTrack>(id)
        if (!point.isValid) throw DemoFailure.invalid("Invalid track point")
        val paint = color(tint)
        val previous = drawable.trackData
        val next = previous?.copyTrackAndAddGeoPoint(point.latitude, point.longitude, paint, false)
            ?: GLMapTrackData({ _, native -> GLMapTrackData.setPointDataGeo(native, point.latitude, point.longitude, paint) }, 1)
        track.setData(next, drawable.style!!, null)
        drawable.trackData = next
        previous?.close()
    }
    fun setTrackProgress(id: Int, progress: Double, duration: Double) {
        val (drawable, track) = target<GLMapTrack>(id)
        if (!progress.isFinite() || !duration.isFinite() || duration < 0) throw DemoFailure.invalid("Invalid track progress")
        drawable.animation?.cancel(false)
        drawable.animation = if (duration > 0) renderer.animate { animation ->
            animation.setTransition(GLMapAnimation.Linear)
            animation.setDuration(duration)
            track.setProgressIndex(progress)
        } else null
        if (duration == 0.0) track.setProgressIndex(progress)
    }

    fun addLineArrow(options: DemoLineArrowRecord): Int {
        val head = image(options.head)
        val style = vectorStyle(options.style)
        val arrow = GLMapLineArrow(options.drawOrder)
        arrow.setLineStyle(style, head)
        arrow.isHidden = options.hidden
        return add(DemoDrawable(listOf(arrow)).also { it.style = style })
    }
    fun setLineArrowManeuver(id: Int, routeId: Int, index: Int) {
        val (drawable, arrow) = target<GLMapLineArrow>(id)
        val maneuver = CoreResources.track(routeId).line(index)
        val line = maneuver.line
        arrow.setLine(line, maneuver.index)
        drawable.line?.close()
        drawable.line = line
    }

    fun addUserLocation(drawOrder: Int): Int {
        val bitmap = image(DemoImageRecord().apply { svg = "circle_new.svg" })
        val image = GLMapImage(drawOrder).apply { setBitmap(bitmap); setOffset(bitmap.width / 2, bitmap.height / 2); isHidden = true }
        val ring = Array(64) { index -> (2 * Math.PI * index / 64).let { MapPoint(sin(it) * 2048, cos(it) * 2048) } }
        val accuracy = GLMapVectorLayer(drawOrder - 1).apply { setTransformMode(GLMapDrawable.TransformMode.Custom); isHidden = true }
        GLMapVectorObject.createPolygon(arrayOf(ring)).use { circle ->
            GLMapVectorCascadeStyle.createStyle("area{width:1pt;fill-color:#3D99FA26;color:#3D99FA66;}")!!.use { accuracy.setVectorObject(circle, it, null) }
        }
        return add(DemoDrawable(listOf(image, accuracy)).also { it.userLocation = true })
    }
    fun updateUserLocation(id: Int, fix: DemoLocationRecord, animated: Boolean) {
        val drawable = drawable(id)
        if (!drawable.userLocation || !fix.point.isValid) throw DemoFailure.invalid("Drawable $id is not a user location")
        val image = drawable.objects[0] as GLMapImage; val accuracy = drawable.objects[1] as GLMapVectorLayer
        val position = MapPoint.CreateFromGeoCoordinates(fix.latitude, fix.longitude)
        val scale = renderer.convertMetersToInternal(fix.accuracy) / 2048.0
        drawable.animation?.cancel(false)
        drawable.animation = if (animated) renderer.animate { animation ->
            animation.setTransition(GLMapAnimation.Linear)
            animation.setDuration(1.0)
            animation.setPosition(image, position)
            animation.setPosition(accuracy, position)
            animation.setScale(accuracy, scale)
        } else null
        if (!animated) {
            image.position = position
            accuracy.position = position
            accuracy.scale = scale
        }
        drawable.objects.forEach { it.isHidden = false }
    }

    fun addVectorLayer(options: DemoVectorLayerRecord, coordinates: NativeArrayBuffer?, promise: Promise) {
        if (disposed) { promise.reject(DemoFailure.disposed()); return }
        try {
            val source = options.source
            if ((coordinates == null) == (source.asset == null)) throw DemoFailure.invalid("A vector layer needs one source")
            if (source.asset?.contains('/') == true) throw DemoFailure.notFound("Asset ${source.asset} is not bundled")
            val rings = coordinates?.demoLines(source.counts) ?: emptyList()
            val style = GLMapVectorCascadeStyle.createStyle(options.style) ?: throw DemoFailure.invalid("Invalid style ${options.style}")
            fun show(objects: GLMapVectorObjectList): Map<String, Any?> {
                val layer = GLMapVectorLayer(options.drawOrder)
                style.use { layer.setVectorObjects(objects, it, null) }
                return mapOf("id" to add(DemoDrawable(listOf(layer)).also { it.vectorObjects = objects }), "bounds" to objects.bBox.record())
            }
            val asset = source.asset
            if (asset != null) {
                pending.add(promise)
                thread(name = "GLMap demo GeoJSON") {
                    val loaded = runCatching { context.assets.open(asset).use(GLMapVectorObject::createFromGeoJSONStreamOrThrow) }
                    main.post {
                        if (pending.remove(promise)) promise.settle { show(loaded.getOrThrow()) }
                        else { loaded.getOrNull()?.close(); style.close() }
                    }
                }
                return
            }
            if (!rings.all { it.size >= 4 && it.size % 2 == 0 && it.all(Double::isFinite) }) { style.close(); throw DemoFailure.invalid("Expected longitude/latitude pairs") }
            val objects = GLMapVectorObjectList()
            try {
                GeometryBuilder().use { builder ->
                    if (source.polygon) builder.beginPolygon()
                    rings.forEach { builder.addLineLonLat(it) }
                    (builder.build() ?: throw DemoFailure.sdk("GeometryBuilder returned no object")).use { objects.insertObject(0, it) }
                }
            } catch (error: Exception) { objects.close(); style.close(); throw error }
            promise.resolve(show(objects))
        } catch (error: Exception) { promise.reject(DemoFailure.of(error)) }
    }
    fun pickVectorObject(id: Int, x: Double, y: Double, distance: Double): String? {
        val objects = drawable(id).vectorObjects ?: throw DemoFailure.invalid("Drawable $id is not a vector layer")
        return renderer.state?.use { state ->
            val point = state.convertDisplayToInternal(x * density, y * density, MapPoint())
            state.findNearPoint(objects, 0, objects.size(), point, distance)?.use { it.asGeoJSON() }
        }
    }

    fun dispose() {
        if (disposed) return
        disposed = true
        CoreResources.unregisterMap(queryId)
        pending.toList().forEach { it.reject(DemoFailure.disposed()) }; pending.clear()
        map.setOnTouchListener(null)
        cameraAnimation?.cancel(false)
        drawables.keys.toList().forEach(::removeDrawable)
        map.dispose()
        raster?.close(); raster = null
    }
}
