package software.globus.reactnative.core
import globus.glmap.*
interface NativeMapSource { val density:Double; fun state():GLMapViewState? }
data class NativeLine(val line:GLMapVectorObject,val index:Int)
interface NativeTrackSource { fun trackData(color:Int):GLMapTrackData; fun line(index:Int):NativeLine }
/** UI-thread access. Native providers own their source; returned Core wrappers have independent ownership. */
object CoreResources {
 private var next=0
 private val maps=mutableMapOf<Int,NativeMapSource>()
 private val tracks=mutableMapOf<Int,NativeTrackSource>()
 fun registerMap(source:NativeMapSource):Int { val id=++next;maps[id]=source;return id }
 fun unregisterMap(id:Int) { maps.remove(id) }
 fun map(id:Int)=maps[id] ?: throw DemoFailure.disposed()
 fun addTrack(source:NativeTrackSource):Int { val id=++next;tracks[id]=source;return id }
 fun removeTrack(id:Int) { tracks.remove(id) }
 fun track(id:Int)=tracks[id] ?: throw DemoFailure.notFound("Route has been released")
 fun clear() { maps.clear();tracks.clear() }
}
