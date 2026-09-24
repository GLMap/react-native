# GLMap React Native

GLMap brings native maps, search and routing to **React Native and Expo** apps on
**Android and iOS**. Embed an interactive map, draw markers and routes, search for
places, and use downloaded data offline. Search and routing also work without a
map view.

This repository contains four npm packages and a demo catalog with **20 API
examples**.

- [Add a map to your app](#add-a-map-to-your-app)
- [Run the demo](#run-the-demo)
- [Explore the packages](#packages)

## Requirements

- React Native 0.86, Expo 57 and React 19. The example pins React Native 0.86.3.
- An Expo development build or a React Native app with Expo Modules installed.
  **Expo Go and web are not supported** by these native modules.
- Android API 24 or later, Java 17 and NDK 29.
- iOS 16.4 or later, Xcode and CocoaPods on macOS.
- A suitable GLMap API key and network access for online maps, search, routing
  and downloads. Offline operations need data covering the requested area.

The packages resolve native GLMap SDK 2.2.0 from the public Maven repository on
Android and [GLMapSwift](https://github.com/GLMap/GLMapSwift) on iOS.

## Add a map to your app

### 1. Install the packages

From an Expo app, install Map, Core and the development client:

```sh
npx expo install @globus-software/glmap @globus-software/glmap-core expo-dev-client
```

Map depends on Core. Listing Core directly also lets your app import its
initialization API. Add Search or Route separately when you need those APIs.
For an existing React Native app, first follow the
[Expo Modules setup](https://docs.expo.dev/bare/installing-expo-modules/).

### 2. Configure the native host

Add the Map config plugin to your existing `app.json`:

```json
{
  "expo": {
    "plugins": ["@globus-software/glmap"]
  }
}
```

List a plugin for every feature package you install. For example, an app using
Map and Search lists `@globus-software/glmap` and `@globus-software/glsearch`.
Feature plugins include Core setup; a Core-only app lists
`@globus-software/glmap-core` instead.

The plugins configure native integration, framework embedding and uncompressed
map/font assets. On iOS, Core owns the shared Swift conveniences and resources;
feature packages add only their own frameworks. Regenerate and rebuild the
native app after adding or removing packages or plugins:

```sh
npx expo prebuild
```

Commit or back up your own native-project changes before regenerating them.
For apps that maintain native projects manually, apply the corresponding
[config-plugin changes](packages/glmap-core/plugins/with-glmap-core.js) to the
host; JavaScript imports alone do not configure native dependencies.

### 3. Create the map

Use this as `App.tsx` in an Expo app with a single root component:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { GLMapSdk } from '@globus-software/glmap-core';
import { GLMapView, type GLMapViewRef } from '@globus-software/glmap';

export default function App() {
  const map = useRef<GLMapViewRef>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        await GLMapSdk.initialize(process.env.EXPO_PUBLIC_GLMAP_API_KEY ?? '');
        await GLMapSdk.setTileDownloadingAllowed(true);
        if (active) setReady(true);
      } catch (error) {
        if (active) setFailure(String(error));
      }
    }
    void initialize();
    return () => { active = false; };
  }, []);

  if (failure) return <Text>{failure}</Text>;
  if (!ready) return <Text>Loading map…</Text>;

  return (
    <View style={{ flex: 1 }}>
      <GLMapView
        ref={map}
        style={{ flex: 1 }}
        onMapReady={() => {
          void map.current?.moveCamera(
            { center: { latitude: 42.4341, longitude: 19.26 }, zoom: 13 },
            null,
          ).catch(error => setFailure(String(error)));
        }}
      />
      <Text style={{ textAlign: 'center' }}>© OpenStreetMap contributors</Text>
    </View>
  );
}
```

Initialize Core before rendering a map or using the services. `onMapReady` runs
when the native view is attached and sized. A view ref and its drawing handles
belong to that mounted view; do not reuse them after unmounting.

### 4. Supply a key and run

Create `.env.local` in your app and **add it to `.gitignore`**:

```dotenv
EXPO_PUBLIC_GLMAP_API_KEY=your-demo-key
```

Build and launch on an Android emulator/device or an iOS simulator/device:

```sh
npx expo run:android
# Or, on macOS:
npx expo run:ios
```

Expo's `EXPO_PUBLIC_` values are embedded in the JavaScript bundle. Use an
appropriate client key; do not put server secrets there or commit keys.
This example uses online tiles. For offline data registration and downloads,
see the [Core guide](packages/glmap-core/README.md).

## Run the demo

Clone the repository and install its workspace dependencies:

```sh
git clone https://github.com/GLMap/react-native.git glmap_rn
cd glmap_rn
npm install
cd example
npx expo prebuild
```

Build and open **GLMap React Native Demo**:

```sh
npx expo run:android
# Or, on macOS:
npx expo run:ios
```

The catalog is the default entry point; no mode flag is needed. Its screens use
the same TypeScript/React implementation on Android and iOS. Expo generates the
platform hosts under `example/android/` and `example/ios/`.

The catalog also has **Lifecycle checks** and **API checks** actions. Both exercise
the public SDK's `GLMapView`, not a separate test map. Benchmarks are an explicit
opt-in mode; see [VERIFICATION.md](VERIFICATION.md). To start Metro separately for
an installed development build, run `npm run demo` from `example/`.

Use **Search** with its offline option to explore the bundled Montenegro data.
Online features and downloads require a suitable key. Enter one with the
catalog's **API key** button for the current session, or create the ignored
`example/config/local.json` before running the helper:

```json
{"GLMAP_API_KEY":"your-demo-key"}
```

To load that configuration, run
`node scripts/demo-env.mjs npx expo run:android` (or `expo run:ios`) from `example/`.
The helper embeds the key in the bundle; a key entered through the UI is not
persisted. The bundled map supports display and search, not offline road routing
or terrain; download navigation/elevation data for those features.

See the [demo code guide](example/README.md) for the startup flow, shared UI,
feature screens and lifecycle conventions.

## Packages

Use only the modules your app needs. Map, Search and Route depend on Core, not on
one another; Search and Route do not pull in the map renderer.

| npm package | Purpose |
| --- | --- |
| [@globus-software/glmap-core](packages/glmap-core/README.md) | Initialization, shared types, datasets, downloads and foreground location |
| [@globus-software/glmap](packages/glmap/README.md) | Map view, camera, gestures, vectors and drawing handles |
| [@globus-software/glsearch](packages/glsearch/README.md) | Search, autocomplete and map-object queries |
| [@globus-software/glroute](packages/glroute/README.md) | Road routing, custom routes, maneuvers and tracking |

## Contributing and licensing

See [SOURCE.md](SOURCE.md) for package structure and API development, and
[VERIFICATION.md](VERIFICATION.md) for tests and reporting guidance.

See [LICENSE.txt](LICENSE.txt) and each package's license. Native SDK and map-data
terms also apply; bundled map data is © OpenStreetMap contributors.
