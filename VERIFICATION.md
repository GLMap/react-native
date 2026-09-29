# React Native SDK verification

## Host checks

Use the toolchain in [README.md](README.md#requirements). From the repository root:

```sh
npm install
npm run typecheck --workspace example
node --test tests/example.test.cjs
python3 scripts/check-modules.py
python3 tests/run.py
python3 tests/downloads.py
python3 tests/readiness.py
python3 tests/vector_updates.py
python3 scripts/check-vector-api.py
```

The module check enforces Core-only dependencies. The controlled regressions
compile current native method bodies against platform doubles: Kotlin on the JVM
and Swift on macOS. They use Kotlin 2.4.20 and coroutines 1.10.2 from the Gradle
cache; resolve the project's dependencies first on a fresh machine.

`tests/run.py` checks request identity for Core, Search and Route, including late
callbacks and reused IDs, plus iOS location-marker visibility. The
[download regressions](tests/downloads/README.md) check cancellation and file
ownership. These are host tests, not mobile runtime or network tests.

To review package contents and podspec syntax without uploading packages:

```sh
for package in glmap-core glmap glsearch glroute; do
  npm pack --dry-run --workspace="@globus-software/$package"
done
ruby -c packages/glmap-core/GlobusMapCore.podspec
ruby -c packages/glmap/GlobusMap.podspec
ruby -c packages/glsearch/GlobusSearch.podspec
ruby -c packages/glroute/GlobusRoute.podspec
```

Inspect the file lists for keys, caches, build output, large demo fixtures and
native SDK binaries. A package dry-run is not dependency-resolution or runtime
validation.

## Native API and lifecycle checks

Prepare the native example host as described in [Run the demo](README.md#run-the-demo).
Select the API-test entry when building the app from `example/`:

```sh
EXPO_PUBLIC_GLMAP_API_TESTS=1 npx expo run:android --variant release
# On macOS:
EXPO_PUBLIC_GLMAP_API_TESTS=1 npx expo run:ios --configuration Release
```

The `DemoApiChecks.tsx` entry exercises camera/state operations, concurrent work,
drawable ownership, stale handles, unmount and cross-module service geometry.
Collect fresh results separately on each platform. A Release build alone does not
prove that the checks ran.

The default app opens the catalog. Its **API checks** action runs the six public
API scenarios above, while **Lifecycle checks** opens `LifecycleApp.tsx` and runs
eight public-map lifecycle scenarios. Both use `@globus-software/glmap`, not the
private benchmark view. Lifecycle coverage includes concurrent captures, copied
vector input, two-map isolation, camera restoration, ten remounts, invalidated
handles and settlement during unmount. Result persistence is the only native
test-support API used by these screens.

For native gesture, keyboard, rotation, navigation and background/resume checks,
build the **default catalog** without diagnostic flags. The UI suites navigate to
Lifecycle checks themselves and also exercise catalog/API-screen navigation.
Release builds contain their JavaScript bundle and do not require Metro.

From the generated Android host, run:

```sh
cd example/android
./gradlew -PglmapTestBuildType=release -Pandroid.enableMinifyInReleaseBuilds=true \
  :app:connectedReleaseAndroidTest
```

On iOS, first build/install the Release app on the selected simulator. Generate
and run its standalone UI test project from the repository root:

```sh
xcodegen generate --spec example/tests/ios/project.yml
xcodebuild -project example/tests/ios/GLMapDemoUITests.xcodeproj \
  -scheme GLMapDemoUITests \
  -destination 'platform=iOS Simulator,id=<simulator-uuid>' \
  -derivedDataPath build/ios-ui-tests CODE_SIGNING_ALLOWED=NO test
```

The lifecycle-only entry is also available with `EXPO_PUBLIC_GLMAP_LIFECYCLE=1`.
Benchmarks require `EXPO_PUBLIC_GLMAP_BENCH=1` and a Release build; their private
native timing control is not a substitute for testing the public map. Set only
one diagnostic flag at a time. Stop Metro before switching development entry
modes and rebuild Release bundles after changing flags.

Record the target OS, emulator/simulator or physical-device type, entry mode and
build configuration. Keep authenticated service checks and fresh-process offline
restoration separate from bundled-data tests.

## Headless module isolation

Generate isolated Core-only, Search-only and Route-only consumers from the current
package contents:

```sh
python3 scripts/create-headless-probes.py --output build/headless-consumers
```

For each generated app, install dependencies, run `npx expo prebuild`, then build
and launch it on Android and iOS with its selected plugin. Core must not load any
feature framework; Search and Route must not load Map. The Search probe includes
the Montenegro dataset and Route constructs a custom route, so these checks do
not require an authenticated service request.

Inspect the packaged Android libraries and iOS frameworks as well as the displayed
result. The iOS assertions are in `tests/headless-ios/`; their apps must be installed
before the suite runs. Do not treat a combined demo build as proof of headless
module isolation.

## Published GLMap 2.2.0 validation — 2026-09-29

The native release is pinned to `36a343f9275d76734466ecae1f39b9c0e0655a8b` and
SwiftPM tag `2.2.0` to `b07267c4bdd7cfcde5e001708c95d897eaa2f19a`. These checks
used public Maven/SwiftPM artifacts with `GLMAP_SDK_DIR` unset. See
[release-2.2.0.json](tests/results/release-2.2.0.json) for the run summary:

- TypeScript, all **9/9** Node example tests, module/pin checks, vector call-site
  checks, and controlled ownership/download/readiness/vector regressions passed.
- Expo prebuild and CocoaPods integration passed. Android Release/R8 app and
  instrumentation APKs and the iOS Release simulator app built successfully.
- Android 17 arm64 emulator: `defaultCatalogAndPublicApiChecks` passed (**1/1**),
  exercising public lifecycle and API checks and catalog/Dark Theme navigation.
- iPhone 17 / iOS 27.0 arm64 simulator: `testDefaultCatalogAndPublicApiChecks`
  passed (**1/1**) with the same coverage. Public API reports passed **6/6** on
  each platform; public lifecycle reports passed **8/8** on each platform.
- Packaged Android ELF build IDs and iOS simulator framework UUIDs matched the
  public 2.2.0 artifacts. Android `world.vm` remained uncompressed. Public vector
  headers/classes were also inspected for the status-bearing completion API.

These are workspace builds and emulator/simulator runs, not clean-checkout or
physical-device validation. Full gesture, headless, authenticated-service,
benchmark and offline-restoration suites were not repeated. Third-party build
warnings remain. Earlier results below retain their original dev SDK scope;
references to matching pins describe the pins at the time of those runs.

## Recorded results

The verification summary dated **2026-09-24** and the saved
[evidence](tests/results/README.md) record:

| Check | Recorded outcome |
| --- | --- |
| Android Release/R8 API suite | 6/6 checks passed |
| iOS Release API suite | 6/6 checks passed |
| Android Core/Search/Route probes | Each displayed a passing result; packaged native libraries were inspected |
| iOS Core/Search/Route probes | 3/3 XCUITest checks passed; framework lists were inspected |
| Controlled request identity and location visibility | Passed |
| Controlled Core downloads | Passed |
| iOS device archive | Built without signing; not a signed installation or device test |
| TypeScript, podspec syntax and npm contents | Reported passing |

The combined API and headless results cover different native builds; keep their
artifact identities separate. These records do not establish physical-device,
signed-install, complete authenticated service-catalog or reload-UI coverage.
The earlier summary also records moderate dependency advisory warnings; package
contents and type checking are not a security audit.

### Public demo and lifecycle validation

The catalog-default app, public lifecycle sample and native-map readiness changes
were checked on **2026-09-24**. The [run summary](tests/results/demo-cleanup.json)
records commands, the tested source fingerprint, native revisions and target types.

| Check | Outcome |
| --- | --- |
| TypeScript and example entry/cancellation tests | Passed; 9/9 Node tests |
| Package boundaries and controlled native regressions | Passed |
| iOS native-child readiness regression | Passed with production Swift methods and host view doubles |
| Fresh Expo prebuild and CocoaPods integration | Passed with the new application/module identities |
| Android Release/R8 build and UI suite | 3/3 on an arm64 Android 14 emulator |
| Android public lifecycle/API checks | 8/8 lifecycle and 6/6 API checks, exercised through the default catalog |
| iOS Release app and UI suite | 7/7 on an arm64 iPhone 17 / iOS 27.0 simulator |
| iOS public lifecycle/API checks | 8/8 lifecycle and 6/6 API checks |
| iOS device Release app | Built without signing; not installed or run on a physical device |
| Native artifacts and resources | Android build IDs and iOS simulator/device UUIDs and Core resources matched the selected SDK |
| Package dry-runs, documentation and whitespace | Passed |

The iOS API scenario exposed early `onMapReady` delivery: the outer Expo view
could have a size before its native map child did, producing non-finite projection
results. The bridge now lays out the child and checks its attachment/size before
emitting readiness. `tests/readiness.py` covers this ordering, repeated layout,
zero size, detach and disposal. Coordinate assertions were not relaxed.

An additional **iPhone Duo / iOS 27.1** simulator run passed the 8 lifecycle and
6 API scenarios, but only **4/7 UI tests**. Background-state, keyboard Done-button
accessibility and landscape window-aspect assertions failed. These results are
not passing coverage for that target. The native input tests assume standard
single-screen phone geometry and background behavior; additional window/display
configurations need their own validation.

Native builds used prebuilt `2.2.0-dev.515481f9f` artifacts through an explicit
local override, with native and Swift revisions matching `native-sdk.json`.
Dependency pins were unchanged. This is not validation of public Maven/SwiftPM
release resolution. The Android runner first needed a missing UTP dependency
outside offline mode and an available emulator; those setup failures did not run
tests. The first iOS run found the readiness defect above; final standard-target
results were collected after the fix.

Non-fatal third-party Gradle, Expo/React Native, Swift/header and Hermes warnings
remain. No signed physical-device, authenticated-service or fresh-process offline
restoration tests were performed. The benchmark control compiled and its entry
isolation was checked, but no new performance measurements or standalone headless
runtime results are claimed.

### Unified native vector completions

The status-bearing `setVectorObject(s)` API was validated on **2026-09-25** with
native SDK `2.2.0-dev.05553b111`. See [vector-status.json](tests/results/vector-status.json)
for the tested source fingerprint, revisions and artifact provenance.

Public `addVectorLayer` now waits for native `Ready`, rejects cancelled/superseded
preparation with `cancelled`, and reports preparation failure as `sdk_error`.
Unmount settles pending work as `disposed`; rejected creations release unexposed
layers. Both packed and asset-backed geometry follow this path. The renamed
benchmark/support bindings use the same native completion contract.

- Android 14 arm64 emulator, Release/R8: **6/6 API** and **8/8 lifecycle** scenarios
  passed through the default catalog's native input smoke test (**1/1**).
- iPhone 17 / iOS 27.0 arm64 simulator, Release: **6/6 API**, **8/8 lifecycle** and
  the catalog/API native input smoke test (**1/1**) passed.
- `tests/vector_updates.py` compiled production completion-settlement code with
  controlled Android/iOS outcomes. Ready-only success, failure cleanup, duplicate
  replies, repeated disposal and late callbacks all passed.
- TypeScript, nine entry/wait host tests, existing native host regressions, module
  boundaries, readiness checks and packaged vector API inspection passed.
- Android/iOS native IDs and Core resources matched the new SDK artifacts.

The SDK was built with its existing working-tree delta, recorded by manifest hash;
native source was not edited. The pin was intentionally updated in all bindings.
These runs do not establish public release resolution, physical-device or
authenticated-service coverage. Full gesture suites, benchmark timings and
headless runtime suites were not re-run for this migration.

## Release validation and reporting

For each SDK release, check npm and public native dependency resolution, package
contents, config-plugin prebuild and native builds from a fresh consumer. Re-run
API, lifecycle and isolated-module tests against the selected artifacts, including
optimized Android builds. Test signed physical-device deployment, authenticated
services and fresh-process offline restoration separately.

Record source revision, artifact identities, command, toolchain, target type,
configuration, outcome and limitations. Remove API keys and machine-specific paths
from shared logs. Do not infer successful runtime tests from package publication.
