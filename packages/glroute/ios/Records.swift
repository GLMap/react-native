import ExpoModulesCore
import GlobusMapCore
struct DemoRouteQueryRecord: Record {
    @Field var points: [DemoGeoRecord] = []
    @Field var mode: String = "car"
    @Field var offline: Bool = false
}
struct DemoRouteStepRecord: Record {
    @Field var instruction: String = ""
    @Field var turn: String = "continue"
    @Field var duration: Double = 0
}
