import ExpoModulesCore
import GlobusMapCore
public final class GLRouteModule:Module {
    public func definition()->ModuleDefinition {
        Name("GLRoute")
        OnDestroy { DispatchQueue.main.async { RouteSdk.shared.detach() } }
        OnCreate { DispatchQueue.main.async { RouteAssets.register() } }
        let sdk=RouteSdk.shared
        AsyncFunction("route") { (id: Int, query: DemoRouteQueryRecord, promise: Promise) in sdk.route(id, query, promise) }.runOnQueue(.main)
        AsyncFunction("buildRoute") { (steps: [DemoRouteStepRecord], coordinates: NativeArrayBuffer, counts: [Int], promise: Promise) in promise.settle { try sdk.buildRoute(steps, coordinates, counts) } }.runOnQueue(.main)
        AsyncFunction("routeCoordinates") { (id: Int, promise: Promise) in promise.settle { try sdk.routeCoordinates(id) } }.runOnQueue(.main)
        AsyncFunction("maneuver") { (id: Int, index: Int, promise: Promise) in promise.settle { try sdk.maneuver(id, index) } }.runOnQueue(.main)
        AsyncFunction("updateNavigation") { (id: Int, location: DemoLocationRecord, promise: Promise) in
            promise.settle { try sdk.updateNavigation(id, location) }
        }.runOnQueue(.main)
        AsyncFunction("releaseRoute") { (id: Int, promise: Promise) in promise.settle { sdk.releaseRoute(id); return nil } }.runOnQueue(.main)
        AsyncFunction("cancelRequest") { (id: Int, promise: Promise) in promise.settle { sdk.cancelRequest(id); return nil } }.runOnQueue(.main)
    }
}
