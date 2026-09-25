package software.globus.reactnative.testsupport

import android.os.Handler
import android.os.Looper
import globus.glmap.*
import expo.modules.kotlin.jni.NativeArrayBuffer
import java.nio.ByteOrder
import kotlin.math.sin

/** Benchmark-only timings, using public SDK input and explicit Ready outcomes. */
class MapBenchmark(private val map: GLMapTextureView) {
    private val main = Handler(Looper.getMainLooper())
    private val layer = GLMapVectorLayer(3)
    private val styles = arrayOf("#E74C3C", "#2650D6").map {
        checkNotNull(GLMapVectorCascadeStyle.createStyle("line{width:4pt;color:$it;}"))
    }
    private var objects: GLMapVectorObjectList? = null
    private val inputs = mutableMapOf<Int, DoubleArray>()
    private var revision = 0
    private var ready = doubleArrayOf(0.0, 0.0, 0.0)
    private var disposed = false
    init { map.renderer.add(layer) }
    private fun now(): Long { check(Looper.myLooper() == Looper.getMainLooper()); return System.nanoTime() }
    private fun micros(start: Long) = (now() - start) / 1000.0
    fun echo(sequence: Int): Int { now(); return sequence }
    fun payload(values: DoubleArray): DoubleArray {
        val start = now(); val sum = values.sum()
        return doubleArrayOf(sum, micros(start), 0.0, 0.0)
    }
    fun native(count: Int): DoubleArray {
        require(count in listOf(1000, 10000, 100000))
        val values = inputs.getOrPut(count) {
            DoubleArray(count * 2) { index ->
                val t = (index / 2).toDouble() / (count - 1)
                if (index % 2 == 0) 13 + t * 6 else 49 + sin(t * Math.PI * 8) * 0.2
            }
        }
        return geometry(values)
    }
    // The approved SDK bulk API takes DoubleArray. Count the buffer-to-array copy.
    private fun doubles(buffer: NativeArrayBuffer): DoubleArray {
        require(buffer.size() % 8 == 0) { "invalid_buffer_length" }
        val values = DoubleArray(buffer.size() / 8)
        buffer.toDirectBuffer().order(ByteOrder.nativeOrder()).asDoubleBuffer().get(values)
        return values
    }
    fun payloadBuffer(buffer: NativeArrayBuffer): DoubleArray {
        val start = now(); val sum = doubles(buffer).sum()
        return doubleArrayOf(sum, micros(start), 0.0, 0.0)
    }
    fun geometryBuffer(buffer: NativeArrayBuffer): DoubleArray {
        val start = now()
        return geometry(doubles(buffer), start)
    }
    fun geometry(values: DoubleArray, start: Long = now()): DoubleArray {
        require(values.size >= 4 && values.size % 2 == 0) { "invalid_geometry" }
        val next = GLMapVectorObjectList()
        try {
            GeometryBuilder().use { builder ->
                builder.addLineLonLat(values)
                checkNotNull(builder.build()).use { next.insertObject(0, it) }
            }
        } catch (error: Exception) { next.close(); throw error }
        val previous = objects; objects = next
        val construction = micros(start)
        submit(start, false)
        previous?.close()
        return doubleArrayOf(next.size().toDouble(), micros(start), revision.toDouble(), construction)
    }
    fun restyle(alternate: Boolean): DoubleArray {
        val start = now(); checkNotNull(objects) { "missing_geometry" }; submit(start, alternate)
        return doubleArrayOf(objects!!.size().toDouble(), micros(start), revision.toDouble(), 0.0)
    }
    private fun submit(start: Long, alternate: Boolean) {
        val current = ++revision
        layer.setVectorObjects(checkNotNull(objects), styles[if (alternate) 1 else 0]) { result ->
            val elapsed = (System.nanoTime() - start) / 1000.0
            main.post {
                if (!disposed) ready = doubleArrayOf(current.toDouble(), elapsed,
                    if (result == GLMapVectorLayer.UpdateResult.Ready) 1.0 else -1.0)
            }
        }
    }
    fun status(): DoubleArray { now(); return ready }
    fun readback(): String = checkNotNull(objects).get(0).use { checkNotNull(it.asGeoJSON()) }
    fun dispose() {
        disposed = true; map.renderer.remove(layer); layer.close()
        objects?.close(); objects = null; styles.forEach { it.close() }; inputs.clear()
    }
}
