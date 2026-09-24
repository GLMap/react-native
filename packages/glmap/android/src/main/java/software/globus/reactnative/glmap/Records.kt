package software.globus.reactnative.glmap
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import software.globus.reactnative.core.*
class DemoImageRecord : Record {
    @Field var svg: String = ""
    @Field var scale: Double = 1.0
    @Field var tint: String? = null
}
class DemoCameraRecord : Record {
    @Field var center: DemoGeoRecord? = null
    @Field var visibleCenter: DemoGeoRecord? = null
    @Field var zoom: Double? = null
    @Field var angle: Double? = null
    @Field var pitch: Double? = null
    @Field var bounds: DemoBoundsRecord? = null
    @Field var zoomDelta: Double? = null
}
class DemoAnimationRecord : Record {
    @Field var duration: Double? = null
    @Field var flyTo: Boolean? = null
    @Field var linear: Boolean? = null
}
class DemoInsetsRecord : Record {
    @Field var top: Double = 0.0
    @Field var left: Double = 0.0
    @Field var bottom: Double = 0.0
    @Field var right: Double = 0.0
}
class DemoOriginRecord : Record {
    @Field var x: Double = 0.5
    @Field var y: Double = 0.5
}
class DemoClippingRecord : Record {
    @Field var bounds: DemoBoundsRecord = DemoBoundsRecord()
    @Field var minLevel: Double = 0.0
    @Field var maxLevel: Double = 0.0
}
class DemoMapOptionsRecord : Record {
    @Field var altitudeScale: Double? = null
    @Field var hillshades: Boolean? = null
    @Field var elevationLines: Boolean? = null
    @Field var slopes: Boolean? = null
    @Field var visibleInsets: DemoInsetsRecord? = null
    @Field var origin: DemoOriginRecord? = null
    @Field var clipping: DemoClippingRecord? = null
}
class DemoRasterRecord : Record {
    @Field var urlTemplates: List<String> = emptyList()
    @Field var attribution: String = ""
    @Field var cacheName: String = ""
}
class DemoImageOptionsRecord : Record {
    @Field var latitude: Double = 0.0
    @Field var longitude: Double = 0.0
    @Field var image: DemoImageRecord = DemoImageRecord()
    @Field var anchor: String = "center"
    @Field var drawOrder: Int = 0
    @Field var hidden: Boolean = false
    @Field var scale: Double = 1.0
}
class DemoImageChangeRecord : Record {
    @Field var latitude: Double? = null
    @Field var longitude: Double? = null
    @Field var scale: Double? = null
}
class DemoImageGroupRecord : Record {
    @Field var images: List<DemoImageRecord> = emptyList()
    @Field var drawOrder: Int = 0
}
class DemoMarkerSourceRecord : Record {
    @Field var asset: String? = null
}
class DemoMarkerLayerRecord : Record {
    @Field var markers: DemoMarkerSourceRecord = DemoMarkerSourceRecord()
    @Field var images: List<DemoImageRecord> = emptyList()
    @Field var clustered: Boolean = false
    @Field var labelKey: String? = null
    @Field var drawOrder: Int = 0
}
class DemoBalloonRecord : Record {
    @Field var latitude: Double = 0.0
    @Field var longitude: Double = 0.0
    @Field var text: String = ""
    @Field var textStyle: String = ""
    @Field var drawOrder: Int = 0
}
class DemoTrackRecord : Record {
    @Field var style: String = ""
    @Field var drawOrder: Int = 0
    @Field var progressColor: String? = null
}
class DemoLineArrowRecord : Record {
    @Field var style: String = ""
    @Field var head: DemoImageRecord = DemoImageRecord()
    @Field var drawOrder: Int = 0
    @Field var hidden: Boolean = false
}
class DemoVectorSourceRecord : Record {
    @Field var polygon: Boolean = false
    @Field var counts: List<Int> = emptyList()
    @Field var asset: String? = null
}
class DemoVectorLayerRecord : Record {
    @Field var source: DemoVectorSourceRecord = DemoVectorSourceRecord()
    @Field var style: String = ""
    @Field var drawOrder: Int = 0
}
