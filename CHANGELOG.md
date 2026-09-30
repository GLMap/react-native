# Changelog

## 0.1.0-beta.2

- Release Core, Map, Search and Route together, with feature dependencies pinned
  to Core `0.1.0-beta.2`. Native GLMap remains at `2.2.0`.
- Use the root npm workspace lockfile; remove the stale example lockfile that
  still referenced the former `glmap-rn` package.
- Preserve host-owned iOS location permission text, scene configuration and
  AppDelegate when applying any GLMap Expo plugin. The SDK no longer adds a demo
  permission prompt or migrates the application's scene lifecycle.
- Keep the Expo 57 scene migration explicitly in the demo and generated test
  apps, with strict template matching and idempotent prebuilds.
- Apps using foreground location must supply their own
  `ios.infoPlist.NSLocationWhenInUseUsageDescription`. Existing generated hosts
  must review any changes made by earlier plugin versions; removing the old SDK
  hooks does not undo changes already written to native files.

## Native SDK 2.2.0 release update

- Pin the published GLMap 2.2.0 native and SwiftPM revisions for all packages,
  the Expo demo and its native test-support module.
- Document host regeneration and native rebuild requirements; JavaScript/OTA
  updates alone do not update the native SDK.
- Check Android, iOS and test-support dependency pins against `native-sdk.json`.
- npm package versions remain `0.1.0-beta.1`, independent of the native SDK.
