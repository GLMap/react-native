import GLMapCore
public struct NativeLine { public let line:GLMapVectorLine; public let index:UInt32
 public init(line:GLMapVectorLine,index:UInt32) {self.line=line;self.index=index}
}
public enum CoreResources {
 private static var next=0
 private static var maps:[Int:()->GLMapViewState?]=[:]
 private struct Track {let data:(GLMapColor)->GLMapTrackData?;let line:(Int)throws->NativeLine}
 private static var tracks:[Int:Track]=[:]
 public static func registerMap(_ source:@escaping ()->GLMapViewState?)->Int {next+=1;maps[next]=source;return next}
 public static func unregisterMap(_ id:Int) {maps.removeValue(forKey:id)}
 public static func map(_ id:Int)throws->()->GLMapViewState? {guard let source=maps[id] else {throw DemoFailure.disposed};return source}
 public static func addTrack(data:@escaping (GLMapColor)->GLMapTrackData?,line:@escaping (Int)throws->NativeLine)->Int {next+=1;tracks[next]=Track(data:data,line:line);return next}
 public static func removeTrack(_ id:Int) {tracks.removeValue(forKey:id)}
 public static func trackData(_ id:Int,color:GLMapColor)throws->GLMapTrackData? {guard let source=tracks[id] else {throw DemoFailure.notFound("Route released")};return source.data(color)}
 public static func line(_ id:Int,index:Int)throws->NativeLine {guard let source=tracks[id] else {throw DemoFailure.notFound("Route released")};return try source.line(index)}
 public static func clear() {maps.removeAll();tracks.removeAll()}
}
