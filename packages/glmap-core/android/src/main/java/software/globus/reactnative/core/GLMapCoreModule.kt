package software.globus.reactnative.core

import android.content.Context
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.jni.NativeArrayBuffer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class GLMapCoreModule : Module() {
    private val main = Handler(Looper.getMainLooper())
    private val location = DemoLocation { sendEvent("onLocation", it) }
    private val context: Context get() = appContext.reactContext ?: throw DemoFailure.disposed()

    override fun definition() = ModuleDefinition {
        Name("GLMapCore")
        Events("onRegionsChanged", "onRegionProgress", "onAreaProgress", "onLocation")
        OnCreate { main.post { CoreSdk.attach(this@GLMapCoreModule) { name, body -> sendEvent(name, body) } } }
        OnDestroy { main.post { location.stop(); CoreSdk.detach(this@GLMapCoreModule) } }

        AsyncFunction("initialize") { apiKey: String, promise: Promise -> promise.settle { CoreSdk.initialize(context, apiKey); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("setTileDownloadingAllowed") { allowed: Boolean, promise: Promise ->
            promise.settle { CoreSdk.ensureInitialized(context); globus.glmap.GLMapManager.SetTileDownloadingAllowed(allowed); null }
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("addDataSet") { asset: String, kind: String, promise: Promise ->
            try { CoreSdk.addDataSet(context, asset, kind, promise) } catch (error: DemoFailure) { promise.reject(error) }
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("regions") { parent: String?, refresh: Boolean, promise: Promise -> CoreSdk.regions(parent, refresh, promise) }.runOnQueue(Queues.MAIN)
        AsyncFunction("downloadRegion") { id: String, promise: Promise -> promise.settle { CoreSdk.downloadRegion(id); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("cancelRegionDownload") { id: String, promise: Promise -> promise.settle { CoreSdk.cancelRegionDownload(id); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("deleteRegion") { id: String, promise: Promise -> promise.settle { CoreSdk.deleteRegion(id); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("downloadArea") { id: Int, bounds: DemoBoundsRecord, files: List<DemoAreaFileRecord>, promise: Promise ->
            try { CoreSdk.downloadArea(context, id, bounds, files, promise) } catch (error: DemoFailure) { promise.reject(error) }
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("cancelRequest") { id: Int, promise: Promise -> promise.settle { CoreSdk.cancelRequest(id); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("startLocationUpdates") { promise: Promise -> location.start(appContext, promise) }.runOnQueue(Queues.MAIN)
        AsyncFunction("stopLocationUpdates") { promise: Promise -> promise.settle { location.stop(); null } }.runOnQueue(Queues.MAIN)
    }
}
