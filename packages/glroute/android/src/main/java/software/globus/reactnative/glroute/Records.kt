package software.globus.reactnative.glroute
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import software.globus.reactnative.core.*
class DemoRouteQueryRecord : Record {
    @Field var points: List<DemoGeoRecord> = emptyList()
    @Field var mode: String = "car"
    @Field var offline: Boolean = false
}
class DemoRouteStepRecord : Record {
    @Field var instruction: String = ""
    @Field var turn: String = "continue"
    @Field var duration: Double = 0.0
}
