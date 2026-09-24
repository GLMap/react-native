import UIKit
import GLMap
import GLMapCore
import GlobusMapCore
enum MapAssets {
    static let bundle=Bundle.main.url(forResource:"GlobusMapAssets",withExtension:"bundle").flatMap { Bundle(url:$0) }
    static func register() { DemoAssets.register(bundle) }
}
public extension GLMapMarkerData {
    /**
     Sets style to the marker. Style indexes returned by `GLMapMarkerStyleCollection`, when new image is added

     @param style Index of the style.
     */
    func setStyle(_ style: UInt32) {
        GLMapMarkerSetStyle(self, style)
    }

    /**
     Sets text to the marker.

     @param text Text displayed by marker
     @param offset Offset of the text center relative to the marker center
     @param style Text style
     */
    func setText(_ text: String, alignment: GLMapTextAlignment = .undefined, offset: CGPoint = .zero, style: GLMapVectorStyle) {
        GLMapMarkerSetText(self, alignment, text, offset, style)
    }
}
