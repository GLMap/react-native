# Standalone extraction verification — 2026-09-24

Native baseline: **b5ed76b9b68d5651f1eb78f317dcc6fcc93cceb3**, current GLMap `dev`.
The SDK is built as `2.2.0-dev.b5ed76b9b`; all four native libraries' ELF IDs and
Apple UUIDs are verified in `tests/results/artifacts.json`.

| Check | Actual result |
| --- | --- |
| TypeScript | Pass |
| Android Release/R8 APK | Pass |
| Android emulator public API suite | **5/5** |
| iOS simulator Release app/API suite | **5/5**, repeated after pod archive correction |
| iOS device archive, no signing | **Pass** |
| Controlled request-identity tests | Pass for Android and iOS |
| Controlled iOS user-location visibility | Pass: hide, later GPS fix, unhide/bearing |
| Controlled downloads | Pass on both implementations |
| npm pack / package file list | Pass; no example, benchmark module, build cache or native SDK binaries |
| Independent app installing the npm tarball | Android Release/R8 builds |

The independent Expo consumer does not contain `glmap-test-support`; it uses the
packaged config plugin. Example-only fixture/benchmark APIs stay in
`example/modules/glmap-test-support`, outside the distributable module.

The archive check exposed two distinct packaging errors not covered by older simulator
runs: linking GLMapSwift twice when tests used another SPM dependency, and duplicate
XCFramework signature collection in the CocoaPods/SwiftPM output directories. Both
are corrected in package/example ownership. A declared build phase preserves the
CocoaPods module-header/asset paths after aligning output directories; no signatures
are disabled or removed. See the podspec and README for the reason.

Full logs are under ignored `build/verification/`; concise API evidence is in
`tests/results/`. Controlled tests compile production method bodies with callback
and filesystem doubles. They are not HTTP or real process-kill tests.

## Remaining release gates

- Published native 2.2.0 resolution without `GLMAP_SDK_DIR`.
- Signed install and real-device rendering, gestures, memory/performance checks.
- Full RN service-catalog E2E, permissions and authenticated offline-relaunch journey.
- Developer Reload UI recheck: request identity is fixed; the earlier historical
  Reload hang is not asserted resolved by the controlled callback tests.
- Public naming/license/registry approval. `private: true` is deliberate.

The pinned Expo template dependency tree reports moderate npm advisories; dependencies
were not force-upgraded across major versions. Review them with the release toolchain.
No key configuration, native SDK binaries or remote publishing was included.
