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

class DemoFailure(val code: String, message: String) : Exception(message) {
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
fun Promise.reject(failure: DemoFailure) = reject(failure.code, failure.message, null)
fun Promise.settle(body: () -> Any?) {
    val value = try { body() } catch (error: Exception) { reject(DemoFailure.of(error)); return }
    resolve(value)
}

val DemoGeoRecord.isValid get() = latitude in -90.0..90.0 && longitude in -180.0..180.0
val DemoGeoRecord.native get() = MapGeoPoint(latitude, longitude)
val DemoBoundsRecord.isValid get() = south in -90.0..90.0 && north in -90.0..90.0 && west in -180.0..180.0 && east in -180.0..180.0 && south <= north && west <= east
val DemoBoundsRecord.native get() = GLMapBBox().apply {
    addPoint(MapPoint.CreateFromGeoCoordinates(south, west)); addPoint(MapPoint.CreateFromGeoCoordinates(north, east))
}
fun GLMapBBox.record(): Map<String, Double>? {
    if (size_x < 0 || size_y < 0) return null
    val a = MapGeoPoint(MapPoint(origin_x, origin_y)); val b = MapGeoPoint(MapPoint(origin_x + size_x, origin_y + size_y))
    return mapOf("south" to minOf(a.lat, b.lat), "west" to minOf(a.lon, b.lon), "north" to maxOf(a.lat, b.lat), "east" to maxOf(a.lon, b.lon))
}
fun dataSet(name: String) = when (name) {
    "map" -> GLMapInfo.DataSet.MAP
    "navigation" -> GLMapInfo.DataSet.NAVIGATION
    "elevation" -> GLMapInfo.DataSet.ELEVATION
    else -> throw DemoFailure.invalid("Unknown data set $name")
}


/** Copy the JS view once into the array consumed by the public SDK builder. */
fun NativeArrayBuffer.demoDoubles(stride: Int = 2): DoubleArray {
    if (size() % 8 != 0) throw DemoFailure.invalid("Expected packed doubles")
    val values = DoubleArray(size() / 8).also { toDirectBuffer().order(ByteOrder.nativeOrder()).asDoubleBuffer().get(it) }
    if (values.size % stride != 0 || !values.all(Double::isFinite) ||
        !(values.indices step stride).all { values[it] in -180.0..180.0 && values[it + 1] in -90.0..90.0 })
        throw DemoFailure.invalid("Invalid longitude/latitude coordinates")
    return values
}

fun NativeArrayBuffer.demoLines(counts: List<Int>): List<DoubleArray> {
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
