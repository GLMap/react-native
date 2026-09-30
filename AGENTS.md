# Repository guidance

## Scope and structure

This repository provides React Native / Expo bindings for Android and iOS.
Keep changes focused on the public TypeScript API, native modules, config plugins,
examples and tests.

- Core owns initialization, shared types, datasets, downloads and location.
- Map, Search and Route depend only on Core, not on one another.
- Search and Route must remain usable without a map view or renderer.
- Keep API documentation and examples in sync with behavior changes.
- The example starts in the catalog by default. Catalog, lifecycle and API checks
  must use the public SDK map; private native timing views are benchmark-only.

## Implementation and checks

- Update TypeScript and both native implementations together when changing an API.
  Preserve request identity, cancellation, unmount and resource-ownership rules.
- Core owns shared iOS resources and Swift conveniences. Avoid duplicate native
  framework embedding or static symbols in feature packages.
- Test config plugins through Expo prebuild when changing native host integration.
- Use the native versions recorded in `native-sdk.json`; do not silently change
  versions or add machine-specific paths.
- Run `npm run typecheck --workspace example`, `node --test tests/*.test.cjs`,
  `python3 scripts/check-modules.py`, `python3 tests/run.py`,
  `python3 tests/downloads.py`, `python3 tests/readiness.py`,
  `python3 tests/vector_updates.py` and `python3 scripts/check-vector-api.py`.
  Re-run Android/iOS integration suites for API or platform changes, and
  API/lifecycle suites whenever the native SDK pin changes.
- Package versions and Core dependency versions belong in each package's
  `package.json`; Gradle and podspecs read them there. Keep current README install
  commands on `@beta`, not a hard-coded prerelease version.
- Report checks actually performed in the chat, not in committed release reports.
  Distinguish host tests, emulator/simulator runs, unsigned archives,
  signed physical-device runs and authenticated services.

## Documentation and repository hygiene

Write documentation for the published SDK using npm and public native dependency
repositories. Keep temporary publication status and release-preparation workarounds
out of user guides. Do not refer to internal projects, private source checkouts,
workstation paths or development history. Record actual test outcomes without
inferring successful checks from publication status.

Do not commit credentials, native SDK binaries or generated platform builds.
Review shared test logs and remove API keys and machine-specific paths.
Do not publish packages, create remotes or change distribution licenses without
approval.
