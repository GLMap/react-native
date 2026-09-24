import java.io.File
import java.nio.file.Files
import java.util.UUID
import kotlinx.coroutines.*
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

// Real files and coroutines; only the SDK, its callback queue and platform file APIs are doubled.
class MainQueue {
    val jobs = ArrayDeque<() -> Unit>()
    fun post(job: () -> Unit) { jobs.addLast(job) }
    fun drain() { while (jobs.isNotEmpty()) jobs.removeFirst()() }
}
val mainQueue = MainQueue()
fun onMain(job: () -> Unit) = job()
class Context(val cacheDir: File)
class GLMapBBox
class GeoBounds { fun bbox() = GLMapBBox() }
enum class DataSet { Map }
class AreaFile(val dataSet: DataSet, val fileName: String)
class DemoBoundsRecord { val isValid = true; val native = GLMapBBox() }
class DemoAreaFileRecord(val dataSet: String, val fileName: String)
fun dataSet(name: String) = 0
class GLMapError { fun exception() = SdkException("sdk_error", "native failure") }
object SdkError { const val Native = "sdk_error"; const val InvalidArgument = "invalid_argument" }
class SdkException(val code: String, message: String) : Exception(message)
class DemoFailure(val code: String) : Exception(code) {
    companion object {
        fun sdk(message: String) = DemoFailure("sdk_error")
        fun invalid(message: String) = DemoFailure("invalid_argument")
        fun cancelled() = DemoFailure("cancelled")
        fun of(error: GLMapError) = sdk("native failure")
    }
}
class Promise {
    var result: String? = null
    var settlements = 0
    fun resolve(value: Any?) { result = "success"; settlements++ }
    fun reject(error: DemoFailure) { result = error.code; settlements++ }
}
object Backend {
    class Task(val file: File, val completion: (GLMapError?) -> Unit)
    val tasks = linkedMapOf<Long, Task>()
    var next = 0L
    var failNextStart = false
    fun start(path: String, completion: (GLMapError?) -> Unit): Long {
        if (failNextStart) {
            failNextStart = false
            mainQueue.post { completion(GLMapError()) }
            return 0
        }
        val file = File(path); file.writeText("incomplete")
        tasks[++next] = Task(file, completion)
        return next
    }
    fun complete(id: Long, success: Boolean) {
        val task = tasks.remove(id)!!
        if (success) task.file.writeText("complete")
        task.completion(if (success) null else GLMapError())
        mainQueue.drain()
    }
    fun cancel(id: Long) { /* Native completion is deliberately delayed until complete(). */ }
}
object GLMapManager {
    interface DownloadCallback {
        fun onProgress(total: Long, downloaded: Long, speed: Double)
        fun onFinished(error: GLMapError?)
    }
    fun DownloadDataSet(kind: Int, path: String, bounds: GLMapBBox, callback: DownloadCallback) = Backend.start(path, callback::onFinished)
    fun CancelDownloadTask(id: Long) = Backend.cancel(id)
}
class RnAndroid {
    private class Request(val promise: Promise, var cancel: () -> Unit = {})
    private val requests = mutableMapOf<Int, Request>()
    val main = mainQueue
    val emit: ((String, Map<String, Any?>) -> Unit)? = null
    fun register(kind: Int, file: File, box: GLMapBBox) {
        if (file.readText() != "complete") throw DemoFailure.sdk("invalid file")
    }
    /* RN_REQUESTS */
    /* RN_ANDROID */
}

fun main() {
    val root = Files.createTempDirectory("glmap-download-regression-").toFile()
    try {
        val directory = File(root, "RN Android").apply { mkdirs() }
        val sdk = RnAndroid(); val context = Context(directory)
        for (oldSuccess in listOf(false, true)) {
            val file = "cancel-$oldSuccess.map"
            val first = Promise(); sdk.downloadArea(context, 1, DemoBoundsRecord(), listOf(DemoAreaFileRecord("map", file)), first)
            val old = Backend.next; sdk.cancelRequest(1)
            val second = Promise(); sdk.downloadArea(context, 1, DemoBoundsRecord(), listOf(DemoAreaFileRecord("map", file)), second)
            val newer = Backend.next; val partial = Backend.tasks[newer]!!.file
            check(Backend.tasks[old]!!.file != partial)
            Backend.complete(old, oldSuccess)
            check(first.result == "cancelled" && first.settlements == 1 && second.result == null && partial.exists() && !File(directory, file).exists())
            Backend.complete(newer, true)
            check(second.result == "success" && second.settlements == 1 && File(directory, file).readText() == "complete")
        }
        Backend.failNextStart = true
        val failed = Promise(); sdk.downloadArea(context, 2, DemoBoundsRecord(), listOf(DemoAreaFileRecord("map", "failure.map")), failed)
        mainQueue.drain(); check(failed.result == "sdk_error" && failed.settlements == 1)
        println("PASS RN Android: cancelled late error/success cannot modify replacement, reused request ID, start failure")
    } finally { root.deleteRecursively() }
}
