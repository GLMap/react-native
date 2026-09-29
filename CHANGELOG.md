# Changelog

## Native SDK 2.2.0 release update

- Pin the published GLMap 2.2.0 native and SwiftPM revisions for all packages,
  the Expo demo and its native test-support module.
- Document host regeneration and native rebuild requirements; JavaScript/OTA
  updates alone do not update the native SDK.
- Check Android, iOS and test-support dependency pins against `native-sdk.json`.
- npm package versions remain `0.1.0-beta.1`, independent of the native SDK.
  See [VERIFICATION.md](VERIFICATION.md) for actual release validation results.
