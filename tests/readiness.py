#!/usr/bin/env python3
"""Compile production iOS readiness methods against host-side view doubles."""
from pathlib import Path
import subprocess
from kotlin_runner import ROOT, declaration

source = (ROOT / 'packages/glmap/ios/DemoMapView.swift').read_text()
methods = '\n'.join(declaration(source, marker) for marker in (
    'override func layoutSubviews()', 'override func didMoveToWindow()', 'private func reportReady()',
))
checks = '''import Foundation
import CoreGraphics
class HostView {
    var bounds = CGRect.zero
    var window: NSObject?
    var layoutRequested = false
    func layoutSubviews() {}
    func didMoveToWindow() {}
    func setNeedsLayout() { layoutRequested = true }
}
final class NativeMap {
    var window: NSObject?
    var bounds = CGRect.zero
    var frame = CGRect.zero { didSet { bounds = CGRect(origin: .zero, size: frame.size) } }
    var layouts = 0
    func layoutIfNeeded() { layouts += 1 }
}
final class View: HostView {
    let map = NativeMap()
    var disposed = false
    var readySent = false
    var events = 0
    func onMapReady(_ value: [String: Any]) {
        precondition(map.bounds.width > 0 && map.bounds.height > 0 && map.window != nil)
        precondition(map.layouts > 0, "Readiness preceded native child layout")
        events += 1
    }
''' + methods + '''
}
let window = NSObject()
func attached() -> View {
    let view = View()
    view.window = window; view.map.window = window
    view.bounds = CGRect(x: 0, y: 0, width: 320, height: 600)
    return view
}
let view = attached()
view.didMoveToWindow()
precondition(view.events == 0 && view.layoutRequested, "Sized wrapper is not a ready native map")
view.layoutSubviews()
precondition(view.events == 1)
view.layoutSubviews(); view.didMoveToWindow(); view.layoutSubviews()
precondition(view.events == 1, "Readiness must be emitted only once")
let zero = attached(); zero.bounds = .zero; zero.layoutSubviews()
precondition(zero.events == 0)
let detached = attached(); detached.window = nil; detached.layoutSubviews()
precondition(detached.events == 0)
let childDetached = attached(); childDetached.map.window = nil; childDetached.layoutSubviews()
precondition(childDetached.events == 0)
let disposed = attached(); disposed.disposed = true; disposed.layoutSubviews()
precondition(disposed.events == 0)
print("PASS iOS native-map readiness: child layout, single delivery, zero size, detach and disposal")
'''
out = ROOT / 'build/readiness-tests'
out.mkdir(parents=True, exist_ok=True)
path = out / 'Readiness.swift'
path.write_text(checks)
subprocess.run(['swiftc', '-swift-version', '5', str(path), '-o', str(out / 'readiness')], check=True)
subprocess.run([str(out / 'readiness')], check=True)
