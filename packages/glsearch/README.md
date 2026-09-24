# @globus-software/glsearch

Text/category search, autocomplete and map-object queries for React Native / Expo
on Android and iOS. Search depends only on Core and works without a map view or
renderer.

## Installation

```sh
npx expo install @globus-software/glsearch @globus-software/glmap-core
```

Add `@globus-software/glsearch` to `expo.plugins` in `app.json`, then regenerate
and rebuild your development client. The plugin includes Core setup. Requires
React Native 0.86, Expo 57, React 19, Android API 24+ or iOS 16.4+, and native
GLSearch 2.2.0. Expo Go and web are not supported. See the
[host setup](../../README.md#2-configure-the-native-host).

## Search

Initialize Core first. For offline search, register or download map data covering
the query area; the demo includes a Montenegro dataset.

```ts
import { GLSearch } from '@globus-software/glsearch';

export async function searchPodgorica(signal?: AbortSignal) {
  return GLSearch.search({
    text: 'Podgorica',
    type: 'search',
    offline: true,
    center: { latitude: 42.4341, longitude: 19.26 },
    limit: 30,
  }, signal);
}
```

Pass an `AbortController.signal` and call `abort()` when a request is superseded
or its screen unmounts. Handle both successful completion and rejection; Core's
`errorCode(error)` identifies cancellation and other SDK errors.

Use `type: 'autocomplete'` for suggestions and `categories` for category filters.
Set `offline: false` for online search with a suitable key and network access.
Returned places are JavaScript values and do not need a native-resource release.

## Query a displayed map

When your app also uses Map, call `GLSearch.pickMapObject(mapRef, x, y, distance)`
with a live `GLMapViewRef`. The query uses Core's `MapQueryTarget`, so Search does
not import Map. Handle rejection if the map unmounts while a query is pending.

See the [demo code guide](../../example/README.md) for search, selection and POI
picking. Native SDK and map-data terms apply in addition to
[LICENSE.txt](LICENSE.txt).
