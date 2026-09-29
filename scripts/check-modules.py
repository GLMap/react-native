#!/usr/bin/env python3
from pathlib import Path
import json,subprocess
root=Path(__file__).resolve().parents[1]
pin=json.loads((root/'native-sdk.json').read_text())
version=pin['releaseVersion']
for name in ('glmap-core','glmap','glsearch','glroute'):
 p=root/'packages'/name;j=json.loads((p/'package.json').read_text())
 assert j['name']=='@globus-software/'+name
 assert set(j.get('dependencies',{})) <= {'@globus-software/glmap-core'}
 if name!='glmap-core':assert '@globus-software/glmap-core' in j['dependencies']
 android=(p/'android/build.gradle').read_text()
 assert f": '{version}'" in android, f'{name}: Android SDK pin differs from native-sdk.json'
 assert pin['androidRepository'] in android
 pods=list(p.glob('*.podspec'))
 assert len(pods)==1, f'{name}: expected one podspec'
 apple=pods[0].read_text()
 assert f"kind:'exactVersion',version:'{version}'" in apple, f'{name}: SwiftPM SDK pin differs from native-sdk.json'
 assert pin['swiftPackage'] in apple
 print('PASS',j['name'],'native SDK',version)
support=(root/'example/modules/glmap-test-support/android/build.gradle').read_text()
assert f": '{version}'" in support, 'Demo test-support SDK pin differs from native-sdk.json'
print('PASS demo test-support pin',version)
