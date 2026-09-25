# @globus-software/glmap

Native GLMap views for React Native / Expo on Android and iOS: camera control,
gestures, vectors, hit testing and map-owned drawings. Map depends on Core, not
on Search or Route.

## Installation

```sh
npx expo install @globus-software/glmap @globus-software/glmap-core
```

Add `@globus-software/glmap` to `expo.plugins` in `app.json`, then regenerate and
rebuild your development client. The plugin includes Core setup. Requires React
Native 0.86, Expo 57, React 19, Android API 24+ or iOS 16.4+, and native GLMap 2.2.0.
Expo Go and web are not supported. See the
[complete setup](../../README.md#add-a-map-to-your-app).

## Create a map

Initialize `GLMapSdk` from Core before mounting this component:

```tsx
import React, { useRef } from 'react';
import { GLMapView, type GLMapViewRef } from '@globus-software/glmap';

export function MyMap({ onError }: { onError: (error: unknown) => void }) {
  const map = useRef<GLMapViewRef>(null);
  return (
    <GLMapView
      ref={map}
      style={{ flex: 1 }}
      onMapReady={() => {
        void map.current?.moveCamera(
          { center: { latitude: 42.4341, longitude: 19.26 }, zoom: 13 },
          null,
        ).catch(onError);
      }}
    />
  );
}
```

Give the parent a nonzero size. Display requires registered/downloaded map data
or online tiles enabled through Core. Include map-data attribution in your UI.
The [root example](../../README.md#3-create-the-map) includes initialization,
loading/error state and attribution.

## Ownership and behavior

- `onMapReady` runs once the inner native map is attached and laid out with a
  nonzero size, not merely when its React Native container mounts. Use the ref
  for camera, projection, style and drawing operations from that point.
- Refs and drawables belong to one mounted view. Unmount releases its native
  drawings and invalidates their handles; do not reuse them on another map.
- `captureState()` returns a snapshot, not a live camera binding. Await camera
  updates before capturing when ordering matters.
- Image and track handles expose `remove()`. Other drawing APIs expose numeric
  handles used with `removeDrawable()`; keep them scoped to their owner view.
- `addVectorLayer()` resolves only after native `Ready`, when prepared batches
  are installed (not necessarily displayed). `Superseded`/`Cancelled` reject with
  `cancelled`; preparation failure rejects with `sdk_error`. Unmount rejects
  outstanding work with `disposed`. A rejected creation releases its hidden handle.
- Packed geometry arrays use longitude/latitude pairs, not latitude/longitude.
- Import Search separately for `GLSearch.pickMapObject(...)`; Route geometry
  enters Map through Core's `TrackSource` capability.

See the [demo code guide](../../example/README.md) for camera, markers, vectors,
tracks and location examples. Native SDK and map-data terms apply in addition to
[LICENSE.txt](LICENSE.txt).
