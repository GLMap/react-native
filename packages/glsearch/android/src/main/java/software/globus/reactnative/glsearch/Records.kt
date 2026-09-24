package software.globus.reactnative.glsearch
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import software.globus.reactnative.core.*
class DemoSearchRecord : Record {
    @Field var text: String = ""
    @Field var type: String = "search"
    @Field var offline: Boolean = false
    @Field var center: DemoGeoRecord = DemoGeoRecord()
    @Field var limit: Int = 0
    @Field var categories: List<String>? = null
}
