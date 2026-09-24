package software.globus.reactnative.glsearch

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

import software.globus.reactnative.core.*
class GLSearchModule:Module() {
    private val context:Context get()=appContext.reactContext ?: throw DemoFailure.disposed()
    override fun definition()=ModuleDefinition {
        Name("GLSearch")
        OnDestroy { Handler(Looper.getMainLooper()).post { SearchSdk.detach() } }
        AsyncFunction("search") { id: Int, query: DemoSearchRecord, promise: Promise -> SearchSdk.search(id, query, promise) }.runOnQueue(Queues.MAIN)
        AsyncFunction("cancelRequest") { id: Int, promise: Promise -> promise.settle { SearchSdk.cancelRequest(id); null } }.runOnQueue(Queues.MAIN)
        AsyncFunction("pickMapObject") { id:Int,x:Double,y:Double,distance:Double,promise:Promise -> promise.settle { SearchSdk.pickMapObject(id,x,y,distance) } }.runOnQueue(Queues.MAIN)

    }
}
