import ExpoModulesCore
import GlobusMapCore
import GLMapCore
import GLSearch
final class SearchSdk {
    private final class Request {
        let promise:Promise; var cancel:()->Void={}
        init(_ promise:Promise) { self.promise=promise }
    }
    static let shared=SearchSdk()
    private var requests:[Int:Request]=[:]
    private let locale=GLMapLocaleSettings(localesOrder:["en","native"],unitSystem:.international)
    private func begin(_ id: Int, _ promise: Promise) -> Request? {
        guard requests[id] == nil else { promise.reject(.invalid("Request \(id) is already running")); return nil }
        let entry = Request(promise)
        requests[id] = entry
        return entry
    }
    private func finish(_ id: Int, _ entry: Request) -> Promise? {
        guard requests[id] === entry else { return nil }
        return requests.removeValue(forKey: id)?.promise
    }
    func cancelRequest(_ id: Int) {
        guard let request = requests.removeValue(forKey: id) else { return }
        request.cancel()
        request.promise.reject(.cancelled)
    }

    func search(_ id: Int, _ query: DemoSearchRecord, _ promise: Promise) {
        guard query.center.isValid, query.limit >= 0 else { promise.reject(.invalid("Invalid search query")); return }
        guard let entry = begin(id, promise) else { return }
        let request = GLSearchRequest(type: query.type == "autocomplete" ? .autocomplete : .search, text: query.text, center: query.center.native,
                                      limit: query.limit, locales: ["en", "native"], categories: query.categories)
        let completion: GLSearchResultsCompletionBlock = { [weak self] results, error in
            guard let self, let promise = finish(id, entry) else { return }
            if let error { promise.reject(DemoFailure(error)); return }
            promise.resolve((results?.array() ?? []).map(self.place))
        }
        let native = query.offline ? request.startOffline(completion: completion) : request.startOnline(completion: completion)
        if requests[id] === entry { entry.cancel = { GLSearchRequest.cancel(native) } }
    }
    private func place(_ object: GLMapVectorObject) -> [String: Any] {
        let name = object.localizedName(locale)
        var highlights: [Int] = []
        let mark = NSAttributedString.Key("GLMapDemoHighlight")
        if let text = name?.asAttributedString([:], highlight: [mark: true]) {
            text.enumerateAttribute(mark, in: NSRange(location: 0, length: text.length)) { value, range, _ in
                if value != nil { highlights += [range.location, range.location + range.length] }
            }
        }
        let point = GLMapGeoPoint(point: object.point)
        return ["name": name?.asString() ?? "Unnamed", "nameHighlights": highlights, "detail": object.searchSecondaryText?.asString() ?? "",
                "latitude": point.lat, "longitude": point.lon]
    }

    func pickMapObject(_ id:Int,_ x:Double,_ y:Double,_ distance:Double)throws->[String:Any]? {
        guard x.isFinite,y.isFinite,distance.isFinite,distance>=0 else {throw DemoFailure.invalid("Invalid pick coordinates")}
        guard let state=try CoreResources.map(id)(),let value=state.mapObject(at:CGPoint(x:x,y:y),maxDistance:distance) else {return nil}
        return place(value)
    }
    func detach() { let waiting=requests;requests.removeAll();waiting.values.forEach { $0.cancel();$0.promise.reject(.disposed) }
    }
}
