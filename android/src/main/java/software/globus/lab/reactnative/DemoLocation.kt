package software.globus.lab.reactnative

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise

/** Foreground location updates. Main thread only. */
internal class DemoLocation(private val emit: (Map<String, Any?>) -> Unit) : LocationListener {
    private val main = Handler(Looper.getMainLooper())
    private val waiting = mutableSetOf<Promise>()
    private var manager: LocationManager? = null

    fun start(appContext: AppContext, promise: Promise) {
        val context = appContext.reactContext
        val permissions = appContext.permissions
        if (context == null || permissions == null) { promise.reject(DemoFailure.sdk("Permissions are unavailable")); return }
        waiting.add(promise)
        permissions.askForPermissions({ result ->
            main.post {
                if (!waiting.remove(promise)) return@post
                if (result.values.any { it.status == PermissionsStatus.GRANTED }) promise.settle { begin(context); null }
                else promise.reject("permission_denied", "Location permission is required", null)
            }
        }, Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    }
    @SuppressLint("MissingPermission")
    private fun begin(context: Context) {
        val service = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        service.removeUpdates(this)
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter(service.allProviders::contains)
        if (providers.isEmpty()) throw DemoFailure.sdk("No location provider is available")
        providers.forEach { service.requestLocationUpdates(it, 1_000, 0f, this, Looper.getMainLooper()) }
        manager = service
    }
    fun stop() {
        manager?.removeUpdates(this)
        manager = null
        val replies = waiting.toList(); waiting.clear()
        replies.forEach { it.reject(DemoFailure.cancelled()) }
    }

    override fun onLocationChanged(location: Location) {
        emit(mapOf("latitude" to location.latitude, "longitude" to location.longitude, "accuracy" to location.accuracy.toDouble(),
            "bearing" to if (location.hasBearing()) location.bearing.toDouble() else null, "speed" to if (location.hasSpeed()) location.speed.toDouble() else null))
    }
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}
    @Deprecated("Required before API 30")
    override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {}
}
