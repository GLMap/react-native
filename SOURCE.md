# Source guide

## Package layout

| Directory | Responsibility |
| --- | --- |
| `packages/glmap-core/` | Initialization, shared types, datasets, downloads and location |
| `packages/glmap/` | Map view, camera, gestures, vectors and drawables |
| `packages/glsearch/` | Search requests and map-object queries |
| `packages/glroute/` | Routing, custom routes and navigation state |
| `example/` | Runnable API examples, lifecycle sample and native test hosts |
| `tests/` | Controlled ownership/download regressions and saved results |
| `scripts/` | Package-boundary checks, artifact checks and isolated test apps |

Each package exposes its TypeScript API from `src/index.tsx`, Android code under
`android/src/main/java/`, iOS code under `ios/`, and an Expo config plugin through
`app.plugin.js`. `expo-module.config.json` registers its native module. The root
npm workspace connects the example to these packages.

Native dependency versions are recorded in [native-sdk.json](native-sdk.json).
See the [requirements](README.md#requirements) and
[host setup](README.md#2-configure-the-native-host). Native SDK source and binaries
are not part of this workspace.

## Boundaries and resource lifetime

Core is the only shared package dependency. Map must not import Search or Route;
service-only applications must not load the renderer.

- Core's `MapQueryTarget` lets Search query an optional map view without depending
  on the Map package.
- Core's `TrackSource` lets Map consume a Route handle without copying its geometry
  through JavaScript or importing the Route package.
- Native map refs and drawables belong to one mounted view. Unmount must settle
  pending work and reject later use of invalid handles.
- Service calls use `AbortSignal` where cancellation is supported. A late callback
  must not complete a newer request that happens to reuse an ID.
- `GLRoute` retains native state until `release()`. Release screen-owned routes
  and location subscriptions during cleanup.
- Keep packed coordinate order explicit: geometry arrays use longitude, latitude;
  `GeoPoint` objects use named fields.

## Example and diagnostic boundaries

The default `example/App.tsx` exports the demo catalog. Catalog screens,
`LifecycleApp.tsx` and `DemoApiChecks.tsx` use the public `GLMapView`; do not replace
it with an example-only native renderer in lifecycle or input tests.

`glmap-test-support` packages demo data and persists result files. Its private
native timing view is exported separately from `src/benchmark.tsx` and is used
only by the explicit benchmark entry. Normal startup must not evaluate those
view bindings. `tests/example.test.cjs` checks entry selection, this separation,
application/module identities and asynchronous wait cleanup.

## Native host integration

Core owns the static Swift conveniences and resources from the native `GLMapCore`
product. Feature pods link binary-only native products. Config plugins embed
selected frameworks and preserve the build paths CocoaPods expects; do not link
shared static symbols a second time or disable framework signatures.

The Core plugin also keeps CocoaPods project IDs unique when React Native adds
SwiftPM dependencies. Preserve that behavior when updating React Native, Expo,
CocoaPods or Xcode. Changes to plugins need prebuild and native-build validation,
not only TypeScript checks.

## Change an API

1. Update the owning package's exported TypeScript types and wrapper.
2. Update Android and iOS native modules, including matching error and cancellation
   behavior. Use Core capabilities for cross-package operations.
3. Update the package README and an example that exercises the public API.
4. Add regressions for removal, unmount, repeated cleanup and concurrent calls.
5. Run the contributor checks in [AGENTS.md](AGENTS.md), including relevant native
   suites. Native dependency changes require renewed API and lifecycle checks on
   both platforms.

Keep large datasets and test-support modules in the example, not public packages.
Review `npm pack --dry-run` output when changing package contents. Never include
keys, native SDK binaries, dependency caches or generated app projects.
