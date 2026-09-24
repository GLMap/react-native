import ExpoModulesCore
import GlobusMapCore
struct DemoSearchRecord: Record {
    @Field var text: String = ""
    @Field var type: String = "search"
    @Field var offline: Bool = false
    @Field var center: DemoGeoRecord = DemoGeoRecord()
    @Field var limit: Int = 0
    @Field var categories: [String]?
}
