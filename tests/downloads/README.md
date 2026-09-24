# Download lifecycle regression tests

From the repository root, run:

```sh
python3 tests/downloads.py
```

Resolve the Gradle dependencies first so Kotlin 2.4.20 and coroutines 1.10.2 are
available in the Gradle cache. The test extracts current production Core download
methods and compiles them against controlled native callbacks. Android methods
run on the JVM; iOS methods compile with Swift and run on the macOS host.

Coverage includes cancellation, late success/error callbacks, reused request IDs,
replacement-file ownership, cache reuse and start failure. These are not Android
or iOS device runs, HTTP tests, process-kill tests or native file-format tests.

See [VERIFICATION.md](../../VERIFICATION.md) for native integration, authenticated
services and reporting guidance. Generated test files remain under ignored
`build/`.
