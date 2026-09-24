import ExpoModulesCore
public struct DemoGeoRecord: Record {
    public init() {}
    @Field public var latitude: Double = 0
    @Field public var longitude: Double = 0
}
public struct DemoBoundsRecord: Record {
    public init() {}
    @Field public var south: Double = 0
    @Field public var west: Double = 0
    @Field public var north: Double = 0
    @Field public var east: Double = 0
}
public struct DemoAreaFileRecord: Record {
    public init() {}
    @Field public var dataSet: String = ""
    @Field public var fileName: String = ""
}
public struct DemoLocationRecord: Record {
    public init() {}
    @Field public var latitude: Double = 0
    @Field public var longitude: Double = 0
    @Field public var accuracy: Double = 0
    @Field public var bearing: Double?
    @Field public var speed: Double?
    public var point: DemoGeoRecord { var point = DemoGeoRecord(); point.latitude = latitude; point.longitude = longitude; return point }
}
