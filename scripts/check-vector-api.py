#!/usr/bin/env python3
"""Check unified vector-completion calls and, when supplied, the selected SDK API."""
from pathlib import Path
import json
import os
import re
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
folders = [root / 'packages/glmap', root / 'glmap/src', root / 'example/modules/glmap-test-support']
callers = []
for folder in folders:
    if not folder.exists():
        continue
    for path in folder.rglob('*'):
        if path.suffix not in ('.kt', '.swift') or any(p in ('build', '.gradle', '.build') for p in path.parts):
            continue
        text = path.read_text()
        assert not re.search(r'setVectorObjectsWithResult|updateCompletion\s*[:=]', text), path.relative_to(root)
        if 'setVectorObjects(' in text:
            callers.append(path)
assert callers, 'No native vector call sites checked'
print(f'PASS unified vector completion call sites: {len(callers)} files')

if os.environ.get('GLMAP_SDK_DIR'):
    sdk = Path(os.environ['GLMAP_SDK_DIR'])
    pin = json.loads((root / 'native-sdk.json').read_text())
    meta = json.loads((sdk / 'sdk.json').read_text())
    assert meta['sourceRevision'] == pin['sourceRevision']
    assert meta['swiftPackageRevision'] == pin['swiftPackageRevision']
    headers = list((sdk / 'ios/GLMap.xcframework').glob('*/GLMap.framework/Headers/GLMapVectorLayer.h'))
    assert headers
    for header in headers:
        source = header.read_text()
        assert 'completion:(GLMapVectorLayerUpdateCompletion' in source and 'updateCompletion:' not in source
        for state in ('Ready', 'Superseded', 'Cancelled', 'Failed'):
            assert 'GLMapVectorLayerUpdateResult' + state in source
    with tempfile.TemporaryDirectory() as directory:
        jar = Path(directory) / 'classes.jar'
        with zipfile.ZipFile(next((sdk / 'maven/globus/glmap').rglob('*.aar'))) as archive:
            jar.write_bytes(archive.read('classes.jar'))
        api = subprocess.check_output(['javap', '-classpath', str(jar), 'globus.glmap.GLMapVectorLayer'], text=True)
        assert 'setVectorObjectsWithResult' not in api
        assert 'setVectorObjects(globus.glmap.GLMapVectorObjectList, globus.glmap.GLMapVectorCascadeStyle, globus.glmap.GLMapVectorLayer$UpdateCompletion)' in api
        callback = subprocess.check_output(['javap', '-classpath', str(jar), 'globus.glmap.GLMapVectorLayer$UpdateCompletion'], text=True)
        assert 'onComplete(int)' in callback
    print('PASS selected Android/Apple SDK APIs and recorded revisions')
