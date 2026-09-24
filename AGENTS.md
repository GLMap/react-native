# Repository guidance

This repository is independent of the former cross-platform laboratory.
Native SDK baseline is in `native-sdk.json`. Use `GLMAP_SDK_DIR` only as an explicit
local override; never hardcode a sibling checkout or `.artifacts` path. Re-run API
and lifecycle tests when changing the native SDK pin. Native binaries and private
keys must never be committed. Keep generated platform builds ignored.

Do not publish, create remotes, or change distribution licenses without approval.
Record actual build/test results and distinguish virtual devices, unsigned device
archives, signed deployment and authenticated service tests.
