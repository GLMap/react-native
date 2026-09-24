import ExpoModulesCore
public final class GLMapCoreModule: Module {
    public func definition() -> ModuleDefinition {
        Name("GLMapCore")
        Events("onRegionsChanged", "onRegionProgress", "onAreaProgress", "onLocation")
        OnCreate { DispatchQueue.main.async { CoreSdk.shared.attach(self) { [weak self] name, body in self?.sendEvent(name, body) } } }
        OnDestroy { DispatchQueue.main.async { CoreSdk.shared.detach(self) } }

        let sdk = CoreSdk.shared
        AsyncFunction("initialize") { (apiKey: String, promise: Promise) in promise.settle { try sdk.initialize(apiKey); return nil } }.runOnQueue(.main)
        AsyncFunction("setTileDownloadingAllowed") { (allowed: Bool, promise: Promise) in promise.settle { sdk.setTileDownloadingAllowed(allowed); return nil } }.runOnQueue(.main)
        AsyncFunction("addDataSet") { (asset: String, kind: String, promise: Promise) in promise.settle { try sdk.addDataSet(asset, kind); return nil } }.runOnQueue(.main)
        AsyncFunction("regions") { (parent: String?, refresh: Bool, promise: Promise) in sdk.regions(parent, refresh, promise) }.runOnQueue(.main)
        AsyncFunction("downloadRegion") { (id: String, promise: Promise) in promise.settle { try sdk.downloadRegion(id); return nil } }.runOnQueue(.main)
        AsyncFunction("cancelRegionDownload") { (id: String, promise: Promise) in promise.settle { try sdk.cancelRegionDownload(id); return nil } }.runOnQueue(.main)
        AsyncFunction("deleteRegion") { (id: String, promise: Promise) in promise.settle { try sdk.deleteRegion(id); return nil } }.runOnQueue(.main)
        AsyncFunction("downloadArea") { (id: Int, bounds: DemoBoundsRecord, files: [DemoAreaFileRecord], promise: Promise) in
            sdk.downloadArea(id, bounds, files, promise)
        }.runOnQueue(.main)
        AsyncFunction("cancelRequest") { (id: Int, promise: Promise) in promise.settle { sdk.cancelRequest(id); return nil } }.runOnQueue(.main)
        AsyncFunction("startLocationUpdates") { (promise: Promise) in sdk.location.start(promise) }.runOnQueue(.main)
        AsyncFunction("stopLocationUpdates") { (promise: Promise) in promise.settle { sdk.location.stop(); return nil } }.runOnQueue(.main)
    }
}
