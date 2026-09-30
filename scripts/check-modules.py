#!/usr/bin/env python3
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
pin=json.loads((root/'native-sdk.json').read_text())
version=pin['releaseVersion']
workspace=json.loads((root/'package.json').read_text())
wrapper_version=json.loads((root/'packages/glmap-core/package.json').read_text())['version']
example=json.loads((root/'example/package.json').read_text())
lock=json.loads((root/'package-lock.json').read_text())
assert workspace['private'] and example['private'], 'Workspace and demo must remain private'
assert 'version' not in workspace and 'version' not in lock and 'version' not in lock['packages']['']
assert not (root/'example/package-lock.json').exists(), 'Use the root workspace lockfile, not a nested legacy lock'
for name in ('glmap-core','glmap','glsearch','glroute'):
 p=root/'packages'/name;j=json.loads((p/'package.json').read_text())
 assert j['name']=='@globus-software/'+name
 assert j['version']==wrapper_version, f'{name}: npm version differs from Core'
 assert not j.get('private',False), f'{name}: public publishing must be enabled'
 assert j['publishConfig']=={'access':'public','tag':'beta','registry':'https://registry.npmjs.org/'}
 assert j['repository']['directory']=='packages/'+name
 expected_dependencies={} if name=='glmap-core' else {'@globus-software/glmap-core':wrapper_version}
 assert j.get('dependencies',{})==expected_dependencies, f'{name}: Core dependency must match this release'
 locked=lock['packages']['packages/'+name]
 assert locked['version']==wrapper_version and locked.get('dependencies',{})==expected_dependencies
 assert lock['packages']['node_modules/'+j['name']]=={'resolved':'packages/'+name,'link':True}
 assert example['dependencies'][j['name']]==wrapper_version
 assert lock['packages']['example']['dependencies'][j['name']]==wrapper_version
 android=(p/'android/build.gradle').read_text()
 assert "JsonSlurper().parse(file('../package.json'))" in android
 assert 'version = packageJson.version' in android and 'versionName packageJson.version' in android
 assert f": '{version}'" in android, f'{name}: Android SDK pin differs from native-sdk.json'
 assert pin['androidRepository'] in android
 pods=list(p.glob('*.podspec'))
 assert len(pods)==1, f'{name}: expected one podspec'
 apple=pods[0].read_text()
 assert "File.join(__dir__, 'package.json')" in apple and "s.version = package.fetch('version')" in apple
 if name!='glmap-core':assert "s.dependency 'GlobusMapCore', package.fetch('dependencies').fetch('@globus-software/glmap-core')" in apple
 assert f"kind:'exactVersion',version:'{version}'" in apple, f'{name}: SwiftPM SDK pin differs from native-sdk.json'
 assert pin['swiftPackage'] in apple
 print('PASS',j['name'],wrapper_version,'native SDK',version)
support=(root/'example/modules/glmap-test-support/android/build.gradle').read_text()
assert f": '{version}'" in support, 'Demo test-support SDK pin differs from native-sdk.json'
assert "JsonSlurper().parse(file('../package.json'))" in support
assert 'version = packageJson.version' in support and 'versionName packageJson.version' in support
print('PASS demo test-support pin',version)
