# GLMap for React Native / Expo

Native GLMap views and services for React Native Fabric and Expo development builds.
This is a standalone npm package repository with a separate `example/` workspace.
**Not published**; names/version and `private` remain release-preparation metadata.
Native SDK baseline: `native-sdk.json`. GLMap 2.1.0 is not compatible.

## Requirements

React Native 0.86.3, Expo 57, React 19; Android API 24+ / Java 17 / NDK 29;
iOS 16.4+ and Xcode. Expo Go cannot load this native module.
The SDK is supplied through Maven and SwiftPM. CocoaPods integrates RN/Expo and
the wrapper; no GLMap SDK pod publication is needed.

## Local native SDK and example

```sh
python3 scripts/prepare-native-sdk.py --sdk-root /path/to/glmap --output /path/to/prepared-sdk
export GLMAP_SDK_DIR=/path/to/prepared-sdk
npm install
cd example
npx expo prebuild
npx expo run:android
# or npx expo run:ios
```

The explicit override contains all four native modules, the default style and both
Apple device/simulator slices, with versioned Maven metadata and recorded hashes.
Unset it after GLMap 2.2.0 publication to resolve the exact public native release.
No source checkout or laboratory directory is required by a consumer.

To use in another app, install this package through a Git/path dependency and add
`"glmap-rn"` to Expo's `plugins`. The packaged plugin sets up native framework
embedding, Android resource compression and the compatible C++ runtime. Rebuild
your development client. It does not install the example test module.

```tsx
import { GLMapSdk, GLMapView, type GLMapViewRef } from 'glmap-rn';
await GLMapSdk.initialize(apiKey);
// GLMapView ref: captureState, moveCamera, addImage/addTrack, layers and picking.
```

Drawables belong to one map. Retained image/track handles reject after unmount;
removal is idempotent. Service calls accept AbortSignal. Native replies are tied
to the request instance, so old callbacks cannot settle reused IDs after Reload.
Packed input is `[longitude, latitude]`; typed-array subviews are supported.

`example/DemoApp.tsx` contains the 20 feature screens. `npm run demo --workspace example`
selects them; Stage A is the default test host. The old fixture/transport module
lives only in `example/modules/glmap-test-support`, outside the package file list.
Use your own local demo key for online services; never commit configuration keys.

## Verification

```sh
npm run typecheck --workspace example
python3 tests/run.py
cd example
EXPO_PUBLIC_GLMAP_API_TESTS=1 npx expo run:android --variant release
```

The controlled tests compile production request-identity and iOS visibility methods;
they do not replace real native API tests. Full build/run evidence and remaining
release gates are in `VERIFICATION.md`. `SOURCE.md` records the extraction baseline.

### iOS archive ownership

The pod links the SwiftPM products exactly once. Its build-product directory is
aligned with SwiftPM's directory to avoid Xcode 27 collecting duplicate XCFramework
signatures during archive. A declared-input/output build phase preserves CocoaPods'
expected module-header and asset-bundle locations; it does not strip signatures or
copy/download SDK binaries. The example-only test pod imports the package instead
of linking a second copy of GLMapSwift. Recheck this boundary on RN/CocoaPods/Xcode upgrades.
