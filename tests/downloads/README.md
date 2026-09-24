# Download lifecycle regression tests

Run `python3 tests/downloads.py` from the repository root after building once
(to cache Kotlin 2.4.20 and coroutines 1.10.2). Tests extract current production
method bodies, use controlled native callbacks, and use real files/coroutines.
They cover cancellation, late callbacks, partial-file ownership and start failure.
KMP's iOS method is tested with JVM filesystem doubles; RN iOS is compiled with
Swift on macOS. These are not HTTP, process-kill or native file-format tests.
