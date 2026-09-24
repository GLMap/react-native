import Foundation
import GlobusMapCore
enum RouteAssets {
    static func register() { DemoAssets.register(Bundle.main.url(forResource:"GlobusRouteAssets",withExtension:"bundle").flatMap { Bundle(url:$0) }) }
}
