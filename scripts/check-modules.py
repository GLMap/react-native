#!/usr/bin/env python3
from pathlib import Path
import json,subprocess
root=Path(__file__).resolve().parents[1]
for name in ('glmap-core','glmap','glsearch','glroute'):
 p=root/'packages'/name;j=json.loads((p/'package.json').read_text())
 assert j['name']=='@globus-software/'+name
 assert set(j.get('dependencies',{})) <= {'@globus-software/glmap-core'}
 if name!='glmap-core':assert '@globus-software/glmap-core' in j['dependencies']
 print('PASS',j['name'])
