import ExpoModulesCore
import GlobusMapCore
public final class GLSearchModule:Module {
    public func definition()->ModuleDefinition {
        Name("GLSearch")
        OnDestroy { DispatchQueue.main.async { SearchSdk.shared.detach() } }
        let sdk=SearchSdk.shared
        AsyncFunction("search") { (id: Int, query: DemoSearchRecord, promise: Promise) in sdk.search(id, query, promise) }.runOnQueue(.main)
        AsyncFunction("cancelRequest") { (id: Int, promise: Promise) in promise.settle { sdk.cancelRequest(id); return nil } }.runOnQueue(.main)
        AsyncFunction("pickMapObject") { (id:Int,x:Double,y:Double,distance:Double,promise:Promise) in promise.settle { try sdk.pickMapObject(id,x,y,distance) } }.runOnQueue(.main)

    }
}
