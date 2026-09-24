package software.globus.reactnative.core

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
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.util.UUID
import kotlin.concurrent.thread

/** SDK services shared by the module and its map views. Main thread only. */
object CoreSdk : GLMapManager.StateListener {
    private class Request(val promise: Promise, var cancel: () -> Unit = {})
    private val main = Handler(Looper.getMainLooper())
    private var owner: Any? = null
    private var emit: ((String, Map<String, Any?>) -> Unit)? = null
    private var initialized = false
    private val requests = mutableMapOf<Int, Request>()
    private val pending = mutableSetOf<Promise>()
    private val locale by lazy { GLMapLocaleSettings(arrayOf("en", "native"), GLMapLocaleSettings.UnitSystem.International) }

    fun attach(owner: Any, emit: (String, Map<String, Any?>) -> Unit) {
        if (this.owner !== owner) this.owner?.let(::detach)
        this.owner = owner; this.emit = emit
    }
    /** A reloaded module may attach before its predecessor detaches. */
    fun detach(owner: Any) {
        if (this.owner !== owner) return
        CoreResources.clear()
        this.owner = null
        emit = null
        val open = requests.values.toList(); requests.clear()
        open.forEach { it.cancel(); it.promise.reject(DemoFailure.disposed()) }
        val waiting = pending.toList(); pending.clear()
        waiting.forEach { it.reject(DemoFailure.disposed()) }
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
