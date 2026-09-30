#!/usr/bin/env python3
from pathlib import Path
import subprocess,json,shutil
import argparse
parser=argparse.ArgumentParser(description='Create isolated Expo headless consumers from local npm tarballs.')
parser.add_argument('--output',required=True,type=Path)
args=parser.parse_args()
repo=Path(__file__).resolve().parents[1];out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
tars=repo/'build/module-tarballs';tars.mkdir(parents=True,exist_ok=True)
scene_manifest=json.loads((repo/'example/app.json').read_text())['expo']['ios']['infoPlist']['UIApplicationSceneManifest']
# Repack current source after fixes. These archives are local test inputs, not publications.
packed={}
for mod in ('glmap-core','glsearch','glroute'):
 result=subprocess.check_output(['npm','pack','--workspace','@globus-software/'+mod,'--pack-destination',str(tars),'--json'],cwd=repo,text=True)
 packed[mod]=tars/json.loads(result)[0]['filename']
for name,mod in [('core','glmap-core'),('search','glsearch'),('route','glroute')]:
 app=out/name;app.mkdir(exist_ok=True)
 package={'name':'headless-'+name,'version':'0.0.1','private':True,'main':'index.ts','dependencies':{'expo':'57.0.23','react':'19.2.3','react-native':'0.86.3','@globus-software/glmap-core':'file:'+str(packed['glmap-core'])},'devDependencies':{'@types/react':'~19.2.2','typescript':'~6.0.3'}}
 if mod!='glmap-core':package['dependencies']['@globus-software/'+mod]='file:'+str(packed[mod])
 (app/'package.json').write_text(json.dumps(package,indent=2)+'\n')
 (app/'app.json').write_text(json.dumps({'expo':{'name':'GLProbe'+name,'slug':'gl-probe-'+name,'ios':{'bundleIdentifier':'software.globus.modules.rn'+name,'infoPlist':{'UIApplicationSceneManifest':scene_manifest}},'android':{'package':'software.globus.modules.rn'+name},'plugins':['@globus-software/'+mod,'./with-expo-scenes']+(['./with-data'] if name=='search' else [])}},indent=2)+'\n')
 # The test apps own their Expo scene lifecycle; it is not an SDK side effect.
 shutil.copy2(repo/'example/plugins/with-expo-scenes.js',app/'with-expo-scenes.js')
 code='''import React,{useEffect,useState} from 'react';
import {View,Text} from 'react-native';
import {registerRootComponent} from 'expo';
import {GLMapSdk} from '@globus-software/glmap-core';
'''+("import {GLSearch} from '@globus-software/glsearch';\n" if name=='search' else "import {GLRouteSDK} from '@globus-software/glroute';\n" if name=='route' else '')+'''function App(){
 const [status,setStatus]=useState('Running');
 useEffect(()=>{(async()=>{
  try {
   await GLMapSdk.initialize('');
'''
 if name=='core':code+="   await GLMapSdk.regions(null,false);\n"
 elif name=='search':
  code+='''   await GLMapSdk.addDataSet('Montenegro.vm','map');
   const places=await GLSearch.search({text:'Podgorica',type:'search',offline:true,center:{latitude:42.4341,longitude:19.26},limit:30});
   if(!places.length)throw new Error('Empty offline search');
'''
  (app/'assets').mkdir(exist_ok=True);shutil.copy2(repo/'example/modules/glmap-test-support/assets/Montenegro.vm',app/'assets/Montenegro.vm')
  (app/'with-data.js').write_text('''const {withXcodeProject,withAppBuildGradle}=require('expo/config-plugins');
module.exports=config=>{
 config=withAppBuildGradle(config,config=>{config.modResults.contents+='\\nandroid { sourceSets { main { assets.srcDirs += "../../assets" } } }\\n';return config;});
 return withXcodeProject(config,config=>{const project=config.modResults;if(!project.pbxGroupByName('Resources')){const group=project.addPbxGroup([],'Resources');project.addToPbxGroup({fileRef:group.uuid,basename:'Resources'},project.getFirstProject().firstProject.mainGroup); }delete project.pbxGroupByName('Resources').path;project.addResourceFile('../assets/Montenegro.vm',{target:config.modResults.getFirstTarget().uuid});return config;});
};
''')
 else:code+='''   const route=await GLRouteSDK.buildRoute([{coordinates:[19.25,42.43,19.27,42.44],instruction:'Continue',turn:'continue',duration:30}]);
   if(!(route.distance>0))throw new Error('Empty route');
   await route.updateNavigation({latitude:42.43,longitude:19.25,accuracy:10,bearing:null,speed:null});
   await route.release();
'''
 code+="   setStatus('PASS "+mod+"');\n  }catch(error){setStatus('FAIL '+String(error));}\n })();},[]);\n return <View style={{flex:1,justifyContent:'center',alignItems:'center'}}><Text style={{fontSize:24}}>{status}</Text></View>;\n}\nregisterRootComponent(App);\n"
 (app/'index.ts').write_text("import './App';\n");(app/'App.tsx').write_text(code)
 print(app,flush=True)
