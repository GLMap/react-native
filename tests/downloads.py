#!/usr/bin/env python3
from pathlib import Path
import subprocess
from kotlin_runner import ROOT, OUT, declaration, run_kotlin
HERE=ROOT/'tests/downloads'
source=(HERE/'Harness.kt').read_text()
production=(ROOT/'packages/glmap-core/android/src/main/java/software/globus/reactnative/core/CoreSdk.kt').read_text()
source=source.replace('/* RN_ANDROID */',declaration(production,'fun downloadArea('))
source=source.replace('/* RN_REQUESTS */',declaration(production,'private fun begin(')+'\n'+production[production.index('    private fun finish('):production.index('    fun cancelRequest(')]+'\n'+declaration(production,'fun cancelRequest('))
run_kotlin(source)
production=(ROOT/'packages/glmap-core/ios/CoreSdk.swift').read_text()
source=(HERE/'Harness.swift').read_text().replace('/* RN_IOS */',declaration(production,'func downloadArea('))
source=source.replace('/* RN_REQUEST */',declaration(production,'private final class Request'))
source=source.replace('/* RN_REQUESTS */','\n'.join(declaration(production,m) for m in ['private func begin(', 'private func finish(', 'func cancelRequest(']))
path=OUT/'Downloads.swift';path.write_text(source)
subprocess.run(['swiftc','-swift-version','5',str(path),'-o',str(OUT/'downloads-swift')],check=True)
subprocess.run([str(OUT/'downloads-swift')],check=True)
