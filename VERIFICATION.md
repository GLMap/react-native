# Modular React Native verification — 2026-09-24

Final combined-build native baseline: `515481f9f`; frozen Swift package: `04f1a99`.

Completed:

- Independent npm/Expo packages under `@globus-software`; Map/Search/Route depend only on Core.
- Full Android Release/R8 and iOS Release API checks: **6/6 on each**, including service
  geometry handoff, Search's Map query capability, stale handles and unmount behavior.
- Independently packaged Core/Search/Route probes run without the renderer on Android
  Release/R8 and iOS Release. The iOS XCUITest suite passes **3/3**; Android checks the
  displayed result. Their native library/framework lists are retained.
- Controlled request-identity regressions pass separately for Core, Search and Route.
- Controlled Core download and iOS user-location visibility regressions pass.
- An unsigned modular iOS device archive succeeds.
- TypeScript, podspec syntax and npm package contents pass. Large demo datasets,
  benchmark code, native SDK binaries and build outputs are excluded from the packages.

The separate headless probes initially used native `b5ed76b9b` with the same frozen
Swift source. Combined tests were then rerun on `515481f9f`. Probe generator:
`scripts/create-headless-probes.py --output <isolated-directory>`; build generated
apps with their selected config plugins before running `tests/headless-ios`.

Two real integration failures were exposed and fixed:

- Android Search's SDK span templates must implement `Cloneable`; the retained
  override is now protected from R8 and exercised by a real offline query.
- CocoaPods reused its root project UUID when RN appended SwiftPM product objects.
  The packaged Core config plugin checks existing UUIDs before accepting newly
  allocated ones. This fixes a reproducible Route-only project corruption, without
  modifying users' gems or React Native sources.

Earlier ownership rules remain: Core alone links the static CoreSwift conveniences;
features link binary-only native products; declared header/asset compatibility paths
and aligned products prevent duplicate archive signatures.

Limits: no physical-device, signed-install, complete service-catalog/network or new
Reload-UI certification. The pinned Expo dependency tree has moderate advisory warnings;
it was not force-upgraded. No registry upload or remote creation was performed.
