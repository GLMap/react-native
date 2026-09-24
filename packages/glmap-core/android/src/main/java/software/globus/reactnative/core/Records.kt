package software.globus.reactnative.core
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
class DemoGeoRecord : Record {
    @Field var latitude: Double = 0.0
    @Field var longitude: Double = 0.0
}
class DemoBoundsRecord : Record {
    @Field var south: Double = 0.0
    @Field var west: Double = 0.0
    @Field var north: Double = 0.0
    @Field var east: Double = 0.0
}
class DemoAreaFileRecord : Record {
    @Field var dataSet: String = ""
    @Field var fileName: String = ""
}
class DemoLocationRecord : Record {
    @Field var latitude: Double = 0.0
    @Field var longitude: Double = 0.0
    @Field var accuracy: Double = 0.0
    @Field var bearing: Double? = null
    @Field var speed: Double? = null
    val point get() = DemoGeoRecord().also { it.latitude = latitude; it.longitude = longitude }
}
