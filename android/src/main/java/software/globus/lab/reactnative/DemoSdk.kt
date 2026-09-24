package software.globus.lab.reactnative

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
import globus.glsearch.*
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.util.UUID
import kotlin.concurrent.thread

internal class DemoFailure(val code: String, message: String) : Exception(message) {
    companion object {
        fun cancelled() = DemoFailure("cancelled", "Request was cancelled")
        fun disposed() = DemoFailure("disposed", "The native owner has been released")
        fun invalid(message: String) = DemoFailure("invalid_argument", message)
        fun notFound(message: String) = DemoFailure("not_found", message)
        fun sdk(message: String) = DemoFailure("sdk_error", message)
        fun of(error: GLMapError) = if (error.isCancelled) cancelled() else sdk("${error.errorDomain} ${error.errorCode}: ${error.message.orEmpty()}")
        fun of(error: Throwable) = error as? DemoFailure ?: sdk(error.message ?: error.toString())
    }
}
internal fun Promise.reject(failure: DemoFailure) = reject(failure.code, failure.message, null)
internal fun Promise.settle(body: () -> Any?) {
    val value = try { body() } catch (error: Exception) { reject(DemoFailure.of(error)); return }
    resolve(value)
}

internal val DemoGeoRecord.isValid get() = latitude in -90.0..90.0 && longitude in -180.0..180.0
internal val DemoGeoRecord.native get() = MapGeoPoint(latitude, longitude)
internal val DemoBoundsRecord.isValid get() = south in -90.0..90.0 && north in -90.0..90.0 && west in -180.0..180.0 && east in -180.0..180.0 && south <= north && west <= east
internal val DemoBoundsRecord.native get() = GLMapBBox().apply {
    addPoint(MapPoint.CreateFromGeoCoordinates(south, west)); addPoint(MapPoint.CreateFromGeoCoordinates(north, east))
}
internal fun GLMapBBox.record(): Map<String, Double>? {
    if (size_x < 0 || size_y < 0) return null
    val a = MapGeoPoint(MapPoint(origin_x, origin_y)); val b = MapGeoPoint(MapPoint(origin_x + size_x, origin_y + size_y))
    return mapOf("south" to minOf(a.lat, b.lat), "west" to minOf(a.lon, b.lon), "north" to maxOf(a.lat, b.lat), "east" to maxOf(a.lon, b.lon))
}
internal fun dataSet(name: String) = when (name) {
    "map" -> GLMapInfo.DataSet.MAP
    "navigation" -> GLMapInfo.DataSet.NAVIGATION
    "elevation" -> GLMapInfo.DataSet.ELEVATION
    else -> throw DemoFailure.invalid("Unknown data set $name")
}

/** SDK services shared by the module and its map views. Main thread only. */
internal object DemoSdk : GLMapManager.StateListener {
    private class Request(val promise: Promise, var cancel: () -> Unit = {})
    private val main = Handler(Looper.getMainLooper())
    private var owner: Any? = null
    private var emit: ((String, Map<String, Any?>) -> Unit)? = null
    private var initialized = false
    private val requests = mutableMapOf<Int, Request>()
    private val pending = mutableSetOf<Promise>()
    private val routes = mutableMapOf<Int, GLRoute>()
    private val trackers = mutableMapOf<Int, GLRouteTracker>()
    private var lastRoute = 0
    private val locale by lazy { GLMapLocaleSettings(arrayOf("en", "native"), GLMapLocaleSettings.UnitSystem.International) }
    private val highlight = Color.rgb(0, 102, 204)

    fun attach(owner: Any, emit: (String, Map<String, Any?>) -> Unit) {
        if (this.owner !== owner) this.owner?.let(::detach)
        this.owner = owner; this.emit = emit
    }
    /** A reloaded module may attach before its predecessor detaches. */
    fun detach(owner: Any) {
        if (this.owner !== owner) return
        this.owner = null
        emit = null
        val open = requests.values.toList(); requests.clear()
        open.forEach { it.cancel(); it.promise.reject(DemoFailure.disposed()) }
        val waiting = pending.toList(); pending.clear()
        waiting.forEach { it.reject(DemoFailure.disposed()) }
        trackers.values.forEach { it.close() }; trackers.clear()
        routes.values.forEach { it.close() }; routes.clear()
    }

    fun initialize(context: Context, apiKey: String) {
        val app = context.applicationContext
        if (!GLMapManager.Initialize(app, apiKey, null)) throw DemoFailure.sdk("GLMap initialization failed")
        if (!initialized) GLMapManager.addStateListener(this)
        initialized = true
    }
    /** A map view created before `initialize` still needs the SDK resources. */
    fun ensureInitialized(context: Context) { if (!initialized) initialize(context, "") }

    fun addDataSet(context: Context, asset: String, kind: String, promise: Promise) {
        val type = try { dataSet(kind) } catch (error: DemoFailure) { promise.reject(error); return }
        if (asset.contains('/')) { promise.reject(DemoFailure.notFound("Asset $asset is not bundled")); return }
        pending.add(promise)
        val app = context.applicationContext
        // The SDK's asset cache does not suit bundled data; register a regular file instead.
        thread(name = "GLMap demo asset") {
            val result = runCatching { materialize(app, asset) }
            main.post {
                if (!pending.remove(promise)) return@post
                promise.settle { register(type, result.getOrThrow(), null); null }
            }
        }
    }
    private fun materialize(context: Context, asset: String): File {
        val directory = File(context.filesDir, "glmap-demo-assets").apply { mkdirs() }
        val file = File(directory, asset)
        val length = try { context.assets.openFd(asset).use { it.length } } catch (_: IOException) { -1L }
        if (file.exists() && file.length() == length) return file
        val temporary = File.createTempFile("asset-", ".tmp", directory)
        try {
            context.assets.open(asset).use { input -> temporary.outputStream().use { input.copyTo(it) } }
            if (!temporary.renameTo(file)) throw DemoFailure.sdk("Cannot install $asset")
        } catch (_: FileNotFoundException) {
            throw DemoFailure.notFound("Asset $asset is not bundled")
        } finally { temporary.delete() }
        return file
    }
    private fun register(kind: Int, file: File, box: GLMapBBox?) {
        // Adding a registered file again fails.
        GLMapManager.RemoveDataSet(kind, file.path)
        if (!GLMapManager.AddDataSet(kind, box, file.path, null, null)) throw DemoFailure.sdk("Cannot open ${file.name}")
    }

    // Requests

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

    fun search(id: Int, query: DemoSearchRecord, promise: Promise) {
        if (!query.center.isValid || query.limit < 0) { promise.reject(DemoFailure.invalid("Invalid search query")); return }
        val entry = begin(id, promise) ?: return
        val type = if (query.type == "autocomplete") GLSearchRequestType.Autocomplete else GLSearchRequestType.Search
        val request = GLSearchRequest(type, query.text, query.center.native, query.limit, arrayOf("en", "native"), query.categories?.toTypedArray())
        val callback = object : GLSearchRequest.ResultsCallback {
            override fun onResult(objects: GLMapVectorObjectList) {
                val places = runCatching { objects.use { list -> list.toArray().map { item -> item.use(::place) } } }
                main.post { finish(id, entry)?.settle { places.getOrThrow() } }
            }
            override fun onError(error: GLMapError) { main.post { finish(id, entry)?.reject(DemoFailure.of(error)) } }
        }
        val native = if (query.offline) request.startOffline(callback) else request.startOnline(callback)
        entry.cancel = { GLSearchRequest.cancel(native) }
    }
    private fun place(item: GLMapVectorObject): Map<String, Any?> {
        val highlights = mutableListOf<Int>()
        var name: String? = null
        var detail: String? = null
        GLSearch.GetDisplayInfo(item, locale)?.let { info ->
            val title = info.title?.getSpanned(ForegroundColorSpan(Color.BLACK), ForegroundColorSpan(highlight), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            title?.getSpans(0, title.length, ForegroundColorSpan::class.java)?.filter { it.foregroundColor == highlight }
                ?.sortedBy(title::getSpanStart)?.forEach { highlights += listOf(title.getSpanStart(it), title.getSpanEnd(it)) }
            name = title?.toString()
            detail = info.secondaryText?.string
            info.close()
        }
        val point = MapGeoPoint(item.point())
        return mapOf("name" to (name ?: "Unnamed"), "nameHighlights" to highlights, "detail" to detail.orEmpty(), "latitude" to point.lat, "longitude" to point.lon)
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
        val id = ++lastRoute
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
    fun releaseRoute(id: Int) { trackers.remove(id)?.close(); routes.remove(id)?.close() }

    // Regions

    private fun region(id: String) = id.toLongOrNull()?.let(GLMapManager::GetMapWithID) ?: throw DemoFailure.notFound("Region $id is unavailable")
    private fun onDevice(info: GLMapInfo): Boolean =
        info.dataSetsWithState(GLMapInfo.State.NOT_DOWNLOADED) != GLMapInfo.DataSetMask.ALL || info.maps?.any(::onDevice) == true
    private fun record(info: GLMapInfo): Map<String, Any?> {
        val task = GLMapManager.getDownloadTasks(info.mapID, GLMapInfo.DataSetMask.ALL)?.firstOrNull()
        return mapOf("id" to info.mapID.toString(), "name" to (info.getLocalizedName(locale) ?: "Region ${info.mapID}"), "isCollection" to info.isCollection,
            "onDevice" to onDevice(info), "downloaded" to (info.dataSetsWithState(GLMapInfo.State.DOWNLOADED) != 0),
            "sizeOnServer" to info.getSizeOnServer(GLMapInfo.DataSetMask.ALL).toDouble(), "sizeOnDisk" to info.getSizeOnDisk(GLMapInfo.DataSetMask.ALL).toDouble(),
            "progress" to task?.let { mapOf("downloaded" to it.downloaded, "total" to it.total) })
    }
    fun regions(parent: String?, refresh: Boolean, promise: Promise) {
        val read = { promise.settle { (if (parent == null) GLMapManager.GetMaps() else region(parent).maps).orEmpty().map(::record) } }
        if (!refresh) { read(); return }
        pending.add(promise)
        GLMapManager.UpdateMapList { _, error ->
            main.post {
                if (!pending.remove(promise)) return@post
                if (error == null) read() else promise.reject(DemoFailure.of(error))
            }
        }
    }
    fun downloadRegion(id: String) { GLMapManager.DownloadDataSets(region(id), GLMapInfo.DataSetMask.ALL) }
    fun cancelRegionDownload(id: String) { GLMapManager.getDownloadTasks(region(id).mapID, GLMapInfo.DataSetMask.ALL)?.forEach { it.cancel() } }
    fun deleteRegion(id: String) { GLMapManager.DeleteDataSets(region(id), GLMapInfo.DataSetMask.ALL) }

    override fun onStartDownloading(task: GLMapDownloadTask) { main.post { emit?.invoke("onRegionsChanged", emptyMap()) } }
    override fun onFinishDownloading(task: GLMapDownloadTask) { main.post { emit?.invoke("onRegionsChanged", emptyMap()) } }
    override fun onStateChanged(map: GLMapInfo?, dataSet: Int) { main.post { emit?.invoke("onRegionsChanged", emptyMap()) } }
    override fun onDownloadProgress(task: GLMapDownloadTask) {
        val event = mapOf("id" to task.map.mapID.toString(), "downloaded" to task.downloaded, "total" to task.total)
        main.post { emit?.invoke("onRegionProgress", event) }
    }

    // Area downloads

    fun downloadArea(context: Context, id: Int, bounds: DemoBoundsRecord, files: List<DemoAreaFileRecord>, promise: Promise) {
        val kinds = try { files.map { dataSet(it.dataSet) } } catch (error: DemoFailure) { promise.reject(error); return }
        if (!bounds.isValid || files.isEmpty() || files.any { it.fileName.isEmpty() || it.fileName.contains('/') }) { promise.reject(DemoFailure.invalid("Invalid area request")); return }
        val entry = begin(id, promise) ?: return
        val box = bounds.native
        val tasks = mutableListOf<Long>()
        var remaining = files.size
        var failure: DemoFailure? = null
        entry.cancel = { tasks.forEach(GLMapManager::CancelDownloadTask) }
        fun finished(error: DemoFailure?) {
            if (failure == null) failure = error
            if (--remaining > 0) return
            val reply = finish(id, entry) ?: return
            failure?.let(reply::reject) ?: reply.resolve(null)
        }
        fun install(kind: Int, file: File) = try { register(kind, file, box); null } catch (error: DemoFailure) { file.delete(); error }
        files.forEachIndexed { index, item ->
            val kind = kinds[index]
            val target = File(context.cacheDir, item.fileName)
            if (target.exists()) { finished(install(kind, target)); return@forEachIndexed }
            // A cancelled request can finish after its replacement has already started.
            val partial = File(context.cacheDir, "${item.fileName}.${UUID.randomUUID()}.part")
            var task = 0L
            task = GLMapManager.DownloadDataSet(kind, partial.path, box, object : GLMapManager.DownloadCallback {
                override fun onProgress(totalSize: Long, downloadedSize: Long, downloadSpeed: Double) {
                    main.post { if (requests[id] === entry) emit?.invoke("onAreaProgress", mapOf("requestId" to id, "dataSet" to item.dataSet, "downloaded" to downloadedSize.toDouble(), "total" to totalSize.toDouble())) }
                }
                override fun onFinished(error: GLMapError?) {
                    main.post {
                        if (!tasks.remove(task)) return@post
                        try {
                            if (requests[id] !== entry) return@post
                            val result = when {
                                error != null -> DemoFailure.of(error)
                                !target.exists() && !partial.renameTo(target) -> DemoFailure.sdk("Cannot install ${item.fileName}")
                                else -> install(kind, target)
                            }
                            finished(result)
                        } finally { partial.delete() }
                    }
                }
            })
            if (task == 0L) { partial.delete(); finished(DemoFailure.sdk("Cannot start download of ${item.fileName}")) } else tasks += task
        }
    }
}

/** Copy the JS view once into the array consumed by the public SDK builder. */
internal fun NativeArrayBuffer.demoDoubles(stride: Int = 2): DoubleArray {
    if (size() % 8 != 0) throw DemoFailure.invalid("Expected packed doubles")
    val values = DoubleArray(size() / 8).also { toDirectBuffer().order(ByteOrder.nativeOrder()).asDoubleBuffer().get(it) }
    if (values.size % stride != 0 || !values.all(Double::isFinite) ||
        !(values.indices step stride).all { values[it] in -180.0..180.0 && values[it + 1] in -90.0..90.0 })
        throw DemoFailure.invalid("Invalid longitude/latitude coordinates")
    return values
}

internal fun NativeArrayBuffer.demoLines(counts: List<Int>): List<DoubleArray> {
    val values = demoDoubles()
    if (counts.size == 1 && counts[0] == values.size && values.size >= 4) return listOf(values)
    var offset = 0
    val lines = counts.map { count ->
        if (count < 4 || count % 2 != 0 || count > values.size - offset) throw DemoFailure.invalid("Invalid line lengths")
        values.copyOfRange(offset, offset + count).also { offset += count }
    }
    if (offset != values.size || lines.isEmpty()) throw DemoFailure.invalid("Invalid line lengths")
    return lines
}
