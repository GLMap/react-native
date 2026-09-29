# Verification evidence

See [VERIFICATION.md](../../VERIFICATION.md) for commands, recorded outcomes and
test coverage. Native dependency versions are in
[native-sdk.json](../../native-sdk.json).

## Contents

- [release-2.2.0.json](release-2.2.0.json): public GLMap 2.2.0 dependency resolution,
  artifact identities, Expo prebuild and Android/iOS API/lifecycle validation.
- [vector-status.json](vector-status.json): earlier dev SDK vector completion API,
  Ready-gated creation and Android/iOS API/lifecycle validation.

- [demo-cleanup.json](demo-cleanup.json): catalog/public-map cleanup, current build,
  lifecycle/API/UI outcomes and additional simulator limitations.
- `android-api.json` and `ios-api.json`: earlier combined API/lifecycle results.
- `headless-android.json`: independent Core/Search/Route Android probe results.
- `headless-ios-frameworks.json`: packaged frameworks from the iOS probes.
- `artifacts.json` and `source-sha256.json`: saved artifact/source identities.

Each record describes its own tested build. Combined and headless results may
cover different native artifacts; preserve that distinction. Regenerate artifact
identities when recording a new build. A version string or package publication is
not proof that a particular binary or target was tested.

## Adding results

Record the source revision, command, toolchain, configuration, target type and
outcome. Distinguish host regressions, emulator/simulator runs, unsigned device
archives, signed physical-device tests and authenticated services. Explain skipped
checks rather than counting them as passes.

Keep generated apps and working logs under ignored `build/`. Review summaries
before sharing them and remove keys, personal paths and inaccessible log links.
Do not commit credentials or unreviewed authenticated network output.
