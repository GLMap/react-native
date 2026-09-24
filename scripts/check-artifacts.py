#!/usr/bin/env python3
"""Check the built app against the explicit native SDK, rather than trusting its version string."""
import argparse, hashlib, json, os, plistlib, re, struct, subprocess, zipfile
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sdk-dir',type=Path,default=os.environ.get('GLMAP_SDK_DIR'))
parser.add_argument('--apk',type=Path)
parser.add_argument('--ios-app',type=Path)
args=parser.parse_args()
if args.sdk_dir is None or not (args.apk or args.ios_app):parser.error('--sdk-dir (or GLMAP_SDK_DIR), and --apk and/or --ios-app are required')
sdk=args.sdk_dir.resolve();meta=json.loads((sdk/'sdk.json').read_text())
root=Path(__file__).resolve().parents[1];pin=json.loads((root/'native-sdk.json').read_text())
assert meta['sourceRevision']==pin['sourceRevision'],'Native source differs from the recorded baseline; update the pin deliberately'
report={'nativeRevision':meta['sourceRevision'],'nativeVersion':meta['version']}
def elf_id(data):
    assert data[:6]==b'\x7fELF\x02\x01','Expected arm64 ELF64'
    table=struct.unpack_from('<Q',data,32)[0];size,count=struct.unpack_from('<HH',data,54)
    for i in range(count):
        header=table+i*size
        if struct.unpack_from('<I',data,header)[0]!=4:continue
        pos,length=struct.unpack_from('<Q',data,header+8)[0],struct.unpack_from('<Q',data,header+32)[0]
        end=pos+length
        while pos<end:
            names,desc,kind=struct.unpack_from('<III',data,pos);start=pos+12+((names+3)&~3)
            if kind==3 and data[pos+12:pos+12+names]==b'GNU\x00':return data[start:start+desc].hex()
            pos=start+((desc+3)&~3)
    raise AssertionError('Missing GNU build ID')
if args.apk:
    identities={}
    with zipfile.ZipFile(args.apk) as apk:
        for name in ('glmapcore','glmap','glsearch','glroute'):
            path=sdk/f'maven/globus/{name}/{meta["version"]}/{name}-{meta["version"]}.aar'
            with zipfile.ZipFile(path) as aar:
                supplied=elf_id(aar.read(f'jni/arm64-v8a/lib{name}.so'))
                embedded=elf_id(apk.read(f'lib/arm64-v8a/lib{name}.so'))
                assert supplied==embedded,f'Wrong native binary: {name}'
                identities[name]=embedded
        assert apk.getinfo('assets/world.vm').compress_type==0,'world.vm must be uncompressed'
        assert apk.read('assets/world.vm')==(sdk/'ios/Resources/world.vm').read_bytes()
    report['androidBuildIDs']=identities
if args.ios_app:
    app=args.ios_app;info=plistlib.loads((app/'Info.plist').read_bytes());sim=info.get('DTPlatformName')=='iphonesimulator'
    def uuid(p):
        output=subprocess.check_output(['xcrun','dwarfdump','--uuid',str(p)],text=True)
        return re.search(r'UUID: ([\w-]+) \(arm64\)',output).group(1)
    identities={}
    for name in ('GLMapCore','GLMap','GLSearch','GLRoute'):
        root=sdk/f'ios/{name}.xcframework';libraries=plistlib.loads((root/'Info.plist').read_bytes())['AvailableLibraries']
        library=next(x for x in libraries if x['SupportedPlatform']=='ios' and (x.get('SupportedPlatformVariant')=='simulator')==sim)
        supplied=uuid(root/library['LibraryIdentifier']/library['LibraryPath']/name)
        embedded=uuid(app/f'Frameworks/{name}.framework/{name}')
        assert supplied==embedded,f'Wrong embedded binary: {name}'
        identities[name]=embedded
    worlds=list(app.rglob('world.vm'))
    assert any(p.read_bytes()==(sdk/'ios/Resources/world.vm').read_bytes() for p in worlds),'SwiftPM world resources missing'
    report['applePlatform']='simulator' if sim else 'device';report['appleUUIDs']=identities
print(json.dumps(report,indent=2))
