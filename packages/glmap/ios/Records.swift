import ExpoModulesCore
import GlobusMapCore
struct DemoImageRecord: Record {
    @Field var svg: String = ""
    @Field var scale: Double = 1
    @Field var tint: String?
}
struct DemoCameraRecord: Record {
    @Field var center: DemoGeoRecord?
    @Field var visibleCenter: DemoGeoRecord?
    @Field var zoom: Double?
    @Field var angle: Double?
    @Field var pitch: Double?
    @Field var bounds: DemoBoundsRecord?
    @Field var zoomDelta: Double?
}
struct DemoAnimationRecord: Record {
    @Field var duration: Double?
    @Field var flyTo: Bool?
    @Field var linear: Bool?
}
struct DemoInsetsRecord: Record {
    @Field var top: Double = 0
    @Field var left: Double = 0
    @Field var bottom: Double = 0
    @Field var right: Double = 0
}
struct DemoOriginRecord: Record {
    @Field var x: Double = 0.5
    @Field var y: Double = 0.5
}
struct DemoClippingRecord: Record {
    @Field var bounds: DemoBoundsRecord = DemoBoundsRecord()
    @Field var minLevel: Double = 0
    @Field var maxLevel: Double = 0
}
struct DemoMapOptionsRecord: Record {
    @Field var altitudeScale: Double?
    @Field var hillshades: Bool?
    @Field var elevationLines: Bool?
    @Field var slopes: Bool?
    @Field var visibleInsets: DemoInsetsRecord?
    @Field var origin: DemoOriginRecord?
    @Field var clipping: DemoClippingRecord?
}
struct DemoRasterRecord: Record {
    @Field var urlTemplates: [String] = []
    @Field var attribution: String = ""
    @Field var cacheName: String = ""
}
struct DemoImageOptionsRecord: Record {
    @Field var latitude: Double = 0
    @Field var longitude: Double = 0
    @Field var image: DemoImageRecord = DemoImageRecord()
    @Field var anchor: String = "center"
    @Field var drawOrder: Int = 0
    @Field var hidden: Bool = false
    @Field var scale: Double = 1
}
struct DemoImageChangeRecord: Record {
    @Field var latitude: Double?
    @Field var longitude: Double?
    @Field var scale: Double?
}
struct DemoImageGroupRecord: Record {
    @Field var images: [DemoImageRecord] = []
    @Field var drawOrder: Int = 0
}
struct DemoMarkerSourceRecord: Record {
    @Field var asset: String?
}
struct DemoMarkerLayerRecord: Record {
    @Field var markers: DemoMarkerSourceRecord = DemoMarkerSourceRecord()
    @Field var images: [DemoImageRecord] = []
    @Field var clustered: Bool = false
    @Field var labelKey: String?
    @Field var drawOrder: Int = 0
}
struct DemoBalloonRecord: Record {
    @Field var latitude: Double = 0
    @Field var longitude: Double = 0
    @Field var text: String = ""
    @Field var textStyle: String = ""
    @Field var drawOrder: Int = 0
}
struct DemoTrackRecord: Record {
    @Field var style: String = ""
    @Field var drawOrder: Int = 0
    @Field var progressColor: String?
}
struct DemoLineArrowRecord: Record {
    @Field var style: String = ""
    @Field var head: DemoImageRecord = DemoImageRecord()
    @Field var drawOrder: Int = 0
    @Field var hidden: Bool = false
}
struct DemoVectorSourceRecord: Record {
    @Field var polygon: Bool = false
    @Field var counts: [Int] = []
    @Field var asset: String?
}
struct DemoVectorLayerRecord: Record {
    @Field var source: DemoVectorSourceRecord = DemoVectorSourceRecord()
    @Field var style: String = ""
    @Field var drawOrder: Int = 0
}
