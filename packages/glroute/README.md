# @globus-software/glroute

Road routing, custom routes, maneuvers and tracking for React Native / Expo on
Android and iOS. Route depends only on Core and works without a map view or
renderer.

## Installation

```sh
npx expo install @globus-software/glroute @globus-software/glmap-core
```

Add `@globus-software/glroute` to `expo.plugins` in `app.json`, then regenerate and
rebuild your development client. The plugin includes Core setup. Requires React
Native 0.86, Expo 57, React 19, Android API 24+ or iOS 16.4+, and native GLRoute
2.2.0. Expo Go and web are not supported. See the
[host setup](../../README.md#2-configure-the-native-host).

## Build and track a custom route

Initialize Core first. This example uses supplied geometry and does not perform
a road-routing service request:

```ts
import { GLRouteSDK } from '@globus-software/glroute';

export async function trackCustomRoute() {
  const route = await GLRouteSDK.buildRoute([{
    coordinates: [19.25, 42.43, 19.27, 42.44],
    instruction: 'Continue',
    turn: 'continue',
    duration: 30,
  }]);
  try {
    return await route.updateNavigation({
      latitude: 42.43,
      longitude: 19.25,
      accuracy: 10,
      bearing: null,
      speed: null,
    });
  } finally {
    await route.release();
  }
}
```

Packed geometry uses longitude/latitude pairs. `updateNavigation` returns the
current maneuver, remaining distance/duration, progress and on-route state.

## Road routing and lifetime

- `GLRouteSDK.route(query, signal)` requests a road route. The query supplies
  `points`, `mode` (`car`, `bicycle` or `pedestrian`) and `offline`.
- Online routing needs a suitable API key and network access. Offline road routing
  needs downloaded navigation data; the package includes its `valhalla.json`
  configuration.
- Use `AbortController` to cancel superseded or screen-owned requests. Handle
  rejections, including cancellation.
- A returned `GLRoute` owns native state until `release()`. Release it on screen
  cleanup and when replacing a route, including late results no longer needed.
- `GLRoute` implements Core's `TrackSource`, allowing an optional Map package to
  draw native route geometry without a Route dependency.

This package does not provide voice guidance or a background navigation service.
See the [demo code guide](../../example/README.md) for routing and tracking flows.
Native SDK and map-data terms apply in addition to [LICENSE.txt](LICENSE.txt).
