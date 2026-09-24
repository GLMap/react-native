#!/usr/bin/env python3
"""Build/package a GLMap checkout for local wrapper validation. Never publishes or reads keys."""
import argparse, hashlib, json, plistlib, shutil, subprocess, xml.etree.ElementTree as ET
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sdk-root', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--apple-products', type=Path)
parser.add_argument('--version', help='Must match GL_SDK_VER when --no-build is used')
parser.add_argument('--no-build', action='store_true', help='Package existing Release builds; caller must verify their provenance')
args = parser.parse_args()
sdk = args.sdk_root.expanduser().resolve(); out = args.output.expanduser().resolve()
def run(*cmd, **kwargs): return subprocess.run(cmd, check=True, **kwargs)
def git(*cmd): return subprocess.check_output(['git', '-C', str(sdk), *cmd], text=True).strip()
revision = git('rev-parse', 'HEAD')
version = args.version or '2.2.0-dev.' + revision[:9]
products = args.apple_products.resolve() if args.apple_products else sdk/'build/wrapper-sdk/apple'
if not args.no_build:
    import os
    env = dict(os.environ, GL_SDK_VER=version)
    tasks = [f':{m}:assembleRelease' for m in ('glmapcore','glmap','glsearch','glroute','res-defaultstyle')]
    tasks += [f':{m}:generatePomFileFor{m.capitalize()}Publication' for m in ('glmapcore','glmap','glsearch','glroute')]
    run('./gradlew', *tasks, cwd=sdk/'Android/Framework', env=env)
    for platform in ('iphonesimulator','iphoneos'):
        run('xcodebuild','-project',str(sdk/'GLMap.xcodeproj'),'-target','GLMap','-target','GLMapCore','-target','GLSearch','-target','GLRoute',
            '-configuration','Release','-sdk',platform,
            'ARCHS=arm64 x86_64' if platform=='iphonesimulator' else 'ARCHS=arm64',
            'ONLY_ACTIVE_ARCH=NO','CODE_SIGNING_ALLOWED=NO',
            'IPHONEOS_DEPLOYMENT_TARGET=16.4',f'SYMROOT={products}',f'OBJROOT={products.parent / ("obj-"+platform)}','build',cwd=sdk)
if (out/'sdk.json').exists():
    old = json.loads((out/'sdk.json').read_text())
    if old['sourceRevision'] != revision or old['version'] != version:
        raise SystemExit('Choose a new output directory for a different SDK revision/version.')
out.mkdir(parents=True, exist_ok=True)
apple=out/'ios'; apple.mkdir(exist_ok=True)
modules=['GLMapCore','GLMap','GLSearch','GLRoute']
for module in modules:
    dest=apple/f'{module}.xcframework'
    if dest.exists(): shutil.rmtree(dest)
    run('xcodebuild','-create-xcframework',*[item for platform in ('iphoneos','iphonesimulator') for item in ('-framework',str(products/f'Release-{platform}/{module}.framework'))],'-output',str(dest))
    info=plistlib.loads((dest/'Info.plist').read_bytes())
    platforms={(x['SupportedPlatform'],x.get('SupportedPlatformVariant','')) for x in info['AvailableLibraries']}
    if not {('ios',''),('ios','simulator')} <= platforms: raise SystemExit(f'{module} lacks device/simulator slices')
for name in ('SwiftExtensions.swift','CoreSwiftExtensions.swift'):
    shutil.copy2(sdk/'iOS/GLMapSwift'/name,apple/name)
resources=apple/'Resources'; resources.mkdir(exist_ok=True)
for name in ('world.vm','fonts','DefaultStyle.bundle'):
    src=sdk/'Resources/framework'/name
    if src.is_dir(): shutil.copytree(src, resources/name, dirs_exist_ok=True)
    else: shutil.copy2(src,resources/name)
(apple/'Package.swift').write_text((sdk/'iOS/GLMapSwift.local.package').read_text())
ns={'m':'http://maven.apache.org/POM/4.0.0'}
for module in ('glmapcore','glmap','glsearch','glroute','res-defaultstyle'):
    artifact='glmap-defaultstyle' if module=='res-defaultstyle' else module
    directory=out/f'maven/globus/{artifact}/{version}'; directory.mkdir(parents=True,exist_ok=True)
    shutil.copy2(sdk/f'Android/Framework/{module}/build/outputs/aar/{module}-release.aar',directory/f'{artifact}-{version}.aar')
    pom=directory/f'{artifact}-{version}.pom'
    if module!='res-defaultstyle':
        source=sdk/f'Android/Framework/{module}/build/publications/{module}/pom-default.xml'
        root=ET.parse(source).getroot()
        if root.findtext('m:version',namespaces=ns)!=version: raise SystemExit(f'POM version mismatch: {source}')
        shutil.copy2(source,pom)
    else:
        pom.write_text(f'<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>globus</groupId><artifactId>{artifact}</artifactId><version>{version}</version><packaging>aar</packaging></project>\n')
manifest={'sourceRevision':revision,'sourceDiffSha256':hashlib.sha256(git('diff','HEAD','--binary').encode()).hexdigest(),
          'swiftPackageRevision':subprocess.check_output(['git','-C',str(sdk/'iOS/GLMapSwift'),'rev-parse','HEAD'],text=True).strip(),
          'submodules':git('submodule','status').splitlines(),'version':version,'builtByThisInvocation':not args.no_build,
          'configuration':'Release','iosPlatforms':[(m, plistlib.loads((apple/f'{m}.xcframework/Info.plist').read_bytes())['AvailableLibraries']) for m in modules]}
manifest['files']={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in out.rglob('*') if p.is_file() and p.name!='sdk.json'}
(out/'sdk.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Prepared {version} from {revision}: {out}. No publication performed.')
