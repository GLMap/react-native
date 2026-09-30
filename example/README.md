# GLMap React Native demo code guide

The demo is a catalog of **20 React Native / Expo API examples** for Android and
iOS. Each feature screen keeps SDK calls close to its UI. For installation,
launch commands and API keys, see [Run the demo](../README.md#run-the-demo).

## Native SDK release

Both generated hosts use the published GLMap **2.2.0** artifacts through the
workspace packages: Maven on Android and exact-version SwiftPM on iOS. The native
test-support module uses the same release. After updating the checkout, run
`npm install` at the repository root, then `npx expo prebuild` from `example/`
and rebuild the app. Back up custom native-host edits before regenerating.
Reloading JavaScript alone does not replace native binaries.

The demo owns its iOS permission prompt and scene manifest in `app.json`. Its
explicit `plugins/with-expo-scenes.js` adapts the pinned Expo 57 blank Swift
AppDelegate to `EXExpoAppSceneDelegate` for iOS 27. It is idempotent and rejects
unexpected startup templates rather than deleting custom app code. This is an
app-specific plugin, not part of any published SDK package. Keep your own app's
location explanation and scene lifecycle instead of copying the demo's settings.

## Directory structure

```text
example/
├── index.ts                   # Chooses the root component
├── DemoApp.tsx                # Catalog and Core initialization
├── demo/
│   ├── common.tsx             # Shared screens, controls and task handling
│   ├── mapDisplay.tsx         # Online tiles, themes and terrain
│   ├── camera.tsx             # Camera animation and bounds fitting
│   ├── drawObjects.tsx        # Images, markers, balloons and tracks
│   ├── vectorData.tsx         # Vectors, GeoJSON and GPS track recording
│   ├── search.tsx             # Search UI and POI picking
│   ├── routing.tsx            # Route building and navigation tracking
│   ├── offline.tsx            # Regional and bounding-box downloads
│   └── location.ts            # Shared foreground-location management
├── App.tsx                    # Default entry: exports DemoApp
├── entry-mode.ts               # Explicit diagnostic entry selection
├── LifecycleApp.tsx            # Lifecycle sample using the public GLMapView
├── DemoApiChecks.tsx           # Public API integration scenarios
├── BenchmarkApp.tsx            # Opt-in native transport benchmark
├── modules/glmap-test-support/ # Result files, datasets and private benchmark view
├── scripts/demo-env.mjs        # Optional catalog key configuration
├── plugins/with-tests.js       # Configures the native test hosts
├── plugins/with-expo-scenes.js # Explicit, app-owned Expo scene migration
├── tests/                     # Android input tests and iOS UI tests
├── app.json                   # Expo host and feature-plugin configuration
└── package.json               # Workspace dependencies and run scripts
```

The root npm workspace resolves the four SDK packages from `../packages/`.
The example uses their public TypeScript APIs. Native test-support helpers and
large datasets are not part of the npm SDK packages.

## Entry points and startup

[index.ts](index.ts) opens [App.tsx](App.tsx), which exports the catalog in
[DemoApp.tsx](DemoApp.tsx). No environment flag is needed for the normal app.
The same TypeScript screens run on both platforms; Expo generates the ignored
`android/` and `ios/` hosts. The application ID on both platforms is
`software.globus.glmap.reactnative.demo`.

The catalog initializes Core, enables tile downloads and shows the categorized
`demos` list. The **API key** action applies a session-only key. Selecting a demo
mounts its screen; Back returns to the catalog. **Lifecycle checks** and **API
checks** open additional diagnostics using the public SDK; **Demos** returns to
the catalog and restores its tile-download policy and session key.

For automation, select exactly one optional flag before bundling:

- `EXPO_PUBLIC_GLMAP_API_TESTS=1`: `DemoApiChecks` directly.
- `EXPO_PUBLIC_GLMAP_LIFECYCLE=1`: `LifecycleApp` directly.
- `EXPO_PUBLIC_GLMAP_BENCH=1`: the opt-in `BenchmarkApp`.

Multiple enabled diagnostic flags are rejected. The normal entry does not evaluate
the private benchmark view's JavaScript bindings. Stop Metro before switching
entry modes; rebuild a Release app to change its embedded entry mode.

`scripts/demo-env.mjs` is an optional catalog launcher. It clears diagnostic flags,
reads the ignored `config/local.json` or `GLMAP_API_KEY` environment variable, and
passes the key as `EXPO_PUBLIC_GLMAP_API_KEY`. Expo embeds it into the bundle; it
is not a server secret.

## Shared UI and resource lifetime

[common.tsx](demo/common.tsx) provides:

- `Screen`: safe-area layout, title, Back action and Android back handling.
- `DemoMap`: a `GLMapView` that waits for native readiness, applies visible insets
  and forwards the live ref to the screen.
- `useTasks`: asynchronous error reporting, with cancellation and disposed-map
  errors excluded from the user-facing status.
- `Controls`, `Action` and `Status`: shared presentation components.

Each screen owns its requests, refs, routes and subscriptions. Abort superseded
requests with `AbortController`; remove event subscriptions and stop location
work during effect cleanup. Release routes when replaced or no longer needed,
including late results from obsolete requests. The native map owns its drawings
and releases them on unmount; handles must not move between views.

## Where to find each feature

| Source | Catalog screens |
| --- | --- |
| [mapDisplay.tsx](demo/mapDisplay.tsx) | Online Map, Dark Theme, 3D Terrain |
| [camera.tsx](demo/camera.tsx) | Fly To, Zoom to BBox |
| [drawObjects.tsx](demo/drawObjects.tsx) | Image, Image Group, Markers & Clustering, Balloon, Track Arrows, User Location |
| [vectorData.tsx](demo/vectorData.tsx) | Lines & Polygons, GeoJSON, GPS Track |
| [search.tsx](demo/search.tsx) | Search, POI Tap |
| [routing.tsx](demo/routing.tsx) | Route Building, Turn-by-Turn Navigation |
| [offline.tsx](demo/offline.tsx) | Download Maps, Download BBox |

- **Search** registers the bundled Montenegro map and supports online/offline
  queries, autocomplete, cancellation and result selection.
- **POI Tap** uses `GLSearch.pickMapObject` with a live map-query capability.
- **Route Building** supports car, bicycle and pedestrian routes. Offline road
  routing needs downloaded navigation data, not only the bundled map.
- **Turn-by-Turn Navigation** demonstrates route tracking, foreground GPS and a
  custom sample route. It is not a complete navigation app: it has no voice
  guidance or background-navigation service.
- **User Location / GPS Track** share the foreground-location helper. Permission
  and updates are tied to the user-selected location flow.
- **Download Maps / Download BBox** demonstrate progress, cancellation and data
  management. Terrain needs elevation data in addition to map data.

## Assets and test support

`modules/glmap-test-support/assets/` contains `Montenegro.vm` for offline display
and search, and `uk_postcodes.geojson` for the GeoJSON screen. The native example
module packages those resources. Small SDK drawing assets belong to the Map
package; Route includes its `valhalla.json` configuration. Keep routing
configuration compatible with the native SDK.

`assets/stage-a.json` supplies the lifecycle sample's camera, line and marker.
`LifecycleApp.tsx` creates them through the public `GLMapView` and delegates its
eight checks to `tests/lifecycleChecks.ts`. It cancels screen-owned waits on exit
and recreates the public view rather than calling private disposal methods.

The test-support module's main export only persists result files. Its separate
`src/benchmark.tsx` entry exposes a private native timing control, imported only
by `BenchmarkApp.tsx`. Neither lifecycle nor API coverage is inferred from that
control. Benchmark-specific vector update/readback operations are not public SDK
methods. The native view has a distinct **Benchmark map** accessibility label.

Bundled map data is © OpenStreetMap contributors. Do not move large demo datasets
or benchmarks into the public npm packages.

## Add or change an example

1. Add the screen to the matching `demo/*.tsx` file and use the shared UI helpers.
2. Add its `Demo` entry in `DemoApp.tsx` and update the example count.
3. Register any additional native resources in the example's asset packaging.
4. Handle rejection, cancellation and late results; release screen-owned resources
   during cleanup.
5. Update this guide and the relevant checks in `DemoApiChecks.tsx` or native tests.

Contributor checks are listed in [AGENTS.md](../AGENTS.md).
