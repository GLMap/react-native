package software.globus.reactnative.glsearch
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
import globus.glsearch.*
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.util.UUID
import kotlin.concurrent.thread

// getSpanned clones its span templates through JNI. Keep this override for R8.
@androidx.annotation.Keep
private class QueryColorSpan(color:Int):ForegroundColorSpan(color),Cloneable {
    public override fun clone():QueryColorSpan = QueryColorSpan(foregroundColor)
}

internal object SearchSdk {
    private class Request(val promise:Promise,var cancel:()->Unit={})
    private val requests=mutableMapOf<Int,Request>()
    private val main=Handler(Looper.getMainLooper())
    private val locale by lazy { GLMapLocaleSettings(arrayOf("en","native"),GLMapLocaleSettings.UnitSystem.International) }
    private val highlight=Color.rgb(0,102,204)
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
        GLSearch.GetDisplayInfo(item, locale)?.use { info ->
            val title = info.title?.getSpanned(QueryColorSpan(Color.BLACK), QueryColorSpan(highlight), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            title?.getSpans(0, title.length, ForegroundColorSpan::class.java)?.filter { it.foregroundColor == highlight }
                ?.sortedBy(title::getSpanStart)?.forEach { highlights += listOf(title.getSpanStart(it), title.getSpanEnd(it)) }
            name = title?.toString()
            detail = info.secondaryText?.string
        }
        val point = MapGeoPoint(item.point())
        return mapOf("name" to (name ?: "Unnamed"), "nameHighlights" to highlights, "detail" to detail.orEmpty(), "latitude" to point.lat, "longitude" to point.lon)
    }

    fun pickMapObject(id:Int,x:Double,y:Double,distance:Double):Map<String,Any?>? {
        require(x.isFinite() && y.isFinite() && distance.isFinite() && distance>=0)
        val source=CoreResources.map(id)
        return source.state()?.use { state -> GLSearch.MapObjectNearPoint(state,(x*source.density).toFloat(),(y*source.density).toFloat(),distance)?.use(::place) }
    }
    fun detach() {
        val pending=requests.values.toList();requests.clear()
        pending.forEach { it.cancel();it.promise.reject(DemoFailure.disposed()) }
    }
}
