# @globus-software/glmap-core

Shared services and types for GLMap React Native / Expo: initialization, datasets,
regional and area downloads, and foreground location. Core does not depend on
the map renderer, Search or Route.

## Installation

```sh
npx expo install @globus-software/glmap-core
```

For a Core-only app, add `@globus-software/glmap-core` to `expo.plugins` in
`app.json`, then regenerate and rebuild your development client. Feature plugins
include Core setup when you install Map, Search or Route.

Requires React Native 0.86, Expo 57, React 19, Android API 24+ or iOS 16.4+, and
native GLMap Core 2.2.0. Expo Go and web are not supported. See the
[host setup](../../README.md#2-configure-the-native-host).

## Initialize and register data

Initialize before any map or service calls. This helper registers a dataset that
your application has bundled as a native asset:

```ts
import { GLMapSdk } from '@globus-software/glmap-core';

export async function initializeOfflineMaps(apiKey: string) {
  await GLMapSdk.initialize(apiKey);
  await GLMapSdk.setTileDownloadingAllowed(false);
  await GLMapSdk.addDataSet('Montenegro.vm', 'map');
}
```

The [demo](../../example/README.md) supplies this dataset through its example-only
native module. In your app, add your map file to Android assets and iOS bundle
resources; a Metro `require()` alone does not register a native dataset. Keep map
and font assets uncompressed on Android. Online services and downloads require
a suitable API key.

## Downloads and location

- `regions(parentId, refresh)` reads or refreshes the regional catalog.
- `downloadRegion`, `cancelRegionDownload` and `deleteRegion` manage regional data.
- `onRegionsChanged` and `onRegionProgress` return subscriptions. Call `remove()`
  during component cleanup.
- `downloadArea(bounds, files, { signal, onProgress })` downloads and registers
  selected datasets. Use `AbortController` for screen-owned cancellation.
- Map, navigation and elevation are separate datasets; download the ones needed
  for offline search, routing and terrain.
- `startLocationUpdates()` requests foreground location permission when needed;
  `onLocation` subscribes to fixes. Remove subscriptions and stop updates when
  no longer needed. Configure platform permissions for your app's actual use.
- `GeoPoint`, `Bounds`, `Location`, `TrackSource` and `MapQueryTarget` are shared by
  the optional feature packages.

Use `errorCode(error)` to distinguish cancellation, invalid arguments, disposal,
permissions and native failures. See the [demo code guide](../../example/README.md)
for download and location flows. Native SDK and map-data terms apply in addition
to [LICENSE.txt](LICENSE.txt).
