# Globus React Native / Expo modules

Planned repository: `GLMap/react-native`. Four independent packages under the owned
npm scope `@globus-software`:

- `@globus-software/glmap-core`: initialization, values, datasets/downloads and location.
- `@globus-software/glmap`: map view and drawables; Core only.
- `@globus-software/glsearch`: search/POI APIs; Core only.
- `@globus-software/glroute`: routing/tracking; Core only.

```tsx
import { GLMapSdk } from '@globus-software/glmap-core';
import { GLMapView } from '@globus-software/glmap';
import { GLSearch } from '@globus-software/glsearch';
import { GLRouteSDK } from '@globus-software/glroute';
```

The Core package is shared transitively. Search and Route neither import nor package
Map. Cross-module drawing uses Core track/line providers; POI picking uses a Core
query capability (`GLSearch.pickMapObject(view, x, y, distance)`). Native resource
ownership is preserved instead of serializing geometry back through JavaScript.

## Build

RN 0.86.3, Expo 57, React 19; Android API 24+, NDK 29; iOS 16.4+. Use an Expo development
build, not Expo Go. The native SDK pins are recorded in `native-sdk.json`.

```sh
python3 scripts/prepare-native-sdk.py --sdk-root /path/to/glmap --output /path/to/sdk
export GLMAP_SDK_DIR=/path/to/sdk
npm install
cd example
npx expo prebuild
npx expo run:android
```

Add the config plugin for every product you install. For example, an app using Map
and Search lists `@globus-software/glmap` and `@globus-software/glsearch` in its Expo
plugins. A Core-only app lists `@globus-software/glmap-core`. Plugins share Core setup
and embed only their selected frameworks. The override is local and explicit; the
default native dependency is the forthcoming exact 2.2.0 release.

The example consumes the workspace packages. Its fixture/benchmark module and large
offline datasets remain example-only and are not included in the public modules.
`npm run typecheck --workspace example` validates the public call sites.

## iOS integration ownership

Core is the sole owner of the static CoreSwift conveniences/resources. Feature pods
use native binary-only SwiftPM products, avoiding repeated Swift symbols. Build outputs
are aligned to prevent duplicate XCFramework signatures; a declared build phase keeps
CocoaPods' expected header/asset paths. No signatures are disabled or removed.

The Core config plugin also guards CocoaPods' UUID allocator before RN adds SwiftPM
products. The pinned toolchain otherwise reproducibly reused the Pods project UUID
for a Route product dependency and generated an unreadable project. The guard uses
existing project IDs and does not patch installed gems or node_modules in consumers.
Recheck these integration boundaries when upgrading RN/Expo/CocoaPods/Xcode.

## Tests / release

`python3 tests/run.py` checks request identity for all service owners and iOS location
visibility; `python3 tests/downloads.py` checks Core downloads. Native API tests and
headless Core/Search/Route probes are documented in `VERIFICATION.md`.

Package file lists exclude examples, benchmark code, SDK binaries, caches and keys.
Private publication flags remain set. No registry upload or remote creation is part
of this work. Real-device, authenticated-service and release-resolution gates remain.
