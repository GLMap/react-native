#!/usr/bin/env python3
"""Regression tests compile current production request/visibility methods against small platform doubles."""
from pathlib import Path
import os, subprocess, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'build/ownership-tests'; OUT.mkdir(parents=True,exist_ok=True)
def declaration(source, marker):
    start=source.index(marker); i=source.index('{',start); depth=1; end=i+1
    while depth:
        depth+=(source[end]=='{')-(source[end]=='}');end+=1
    return source[start:end]
def run_kotlin(source):
    cache=Path(os.environ.get('GRADLE_USER_HOME',Path.home()/'.gradle'))/'caches/modules-2/files-2.1'
    def jar(group,artifact,version):return str(next((cache/group/artifact/version).glob(f'*/{artifact}-{version}.jar')))
    version='2.4.20'; ns={'m':'http://maven.apache.org/POM/4.0.0'}
    pom=next((cache/'org.jetbrains.kotlin/kotlin-compiler-embeddable'/version).glob('*/*.pom'))
    deps=[jar(*(d.findtext(f'm:{n}',namespaces=ns) for n in ('groupId','artifactId','version'))) for d in ET.parse(pom).findall('m:dependencies/m:dependency',ns)]
    compiler=jar('org.jetbrains.kotlin','kotlin-compiler-embeddable',version)
    runtime=[jar('org.jetbrains.kotlin','kotlin-stdlib',version),jar('org.jetbrains','annotations','13.0')]
    path=OUT/'Checks.kt';path.write_text(source)
    subprocess.run(['java','-cp',os.pathsep.join([compiler,*deps,*runtime]),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',os.pathsep.join(runtime),'-d',str(OUT/'checks.jar'),str(path)],check=True)
    subprocess.run(['java','-cp',os.pathsep.join([str(OUT/'checks.jar'),*runtime]),'ChecksKt'],check=True)

def main(module, owner, api):
    android=(ROOT/f'packages/{module}/android/src/main/java/software/globus/reactnative/{api}/{owner}.kt').read_text()
    methods=next(line for line in android.splitlines() if 'private class Request(' in line) + '\n' + declaration(android,'private fun begin(')+'\n'+android[android.index('    private fun finish('):android.index('    fun cancelRequest(')]+'\n'+declaration(android,'fun cancelRequest(')
    source='''class DemoFailure(val code: String) {
 companion object { fun invalid(s: String)=DemoFailure("invalid");fun cancelled()=DemoFailure("cancelled") }
}
class Promise { var result:String?=null;var count=0
 fun reject(error:DemoFailure) {result=error.code;count++}
 fun resolve(value:String) {result=value;count++}
}
class Requests {
 private val requests=mutableMapOf<Int,Request>()
'''+methods+'''
 fun start(id:Int, promise:Promise, result:String):()->Unit {
  val entry=begin(id,promise) ?: return {}
  return { finish(id,entry)?.resolve(result) }
 }
}
fun main() {
 for (lateResult in listOf("old-success","old-error")) {
  val sdk=Requests();val a=Promise();val late=sdk.start(1,a,lateResult)
  sdk.cancelRequest(1)
  val b=Promise();val complete=sdk.start(1,b,"new-success")
  late();check(a.result=="cancelled" && a.count==1);check(b.count==0)
  complete();complete();late();check(b.result=="new-success" && b.count==1)
 }
 println("PASS Android request identity: late completion cannot settle reused ID; exactly once")
}
'''
    run_kotlin(source)
    ios=(ROOT/f'packages/{module}/ios/{owner}.swift').read_text()
    methods='\n'.join(declaration(ios,m) for m in ('private final class Request', 'private func begin(', 'private func finish(', 'func cancelRequest('))
    view=(ROOT/'packages/glmap/ios/DemoMapView.swift').read_text()
    visibility=declaration(view,'private func updateLocationVisibility(')
    source='''import Foundation
struct DemoFailure: Error { let code:String; static let cancelled=Self(code:"cancelled");static func invalid(_ s:String)->Self {Self(code:"invalid")} }
final class Promise { var result:String?;var count=0
 func reject(_ error:DemoFailure) {result=error.code;count+=1}
 func resolve(_ value:String) {result=value;count+=1}
}
final class Requests { private var requests:[Int:Request]=[:]
'''+methods+'''
 func start(_ id:Int,_ promise:Promise,_ result:String)->()->Void {
  guard let entry=begin(id,promise) else {return {}}
  return { self.finish(id,entry)?.resolve(result) }
 }
}
for value in ["old-success","old-error"] {
 let sdk=Requests(),a=Promise();let late=sdk.start(1,a,value)
 sdk.cancelRequest(1)
 let b=Promise();let complete=sdk.start(1,b,"new-success")
 late();precondition(a.result=="cancelled" && a.count==1);precondition(b.count==0)
 complete();complete();late();precondition(b.result=="new-success" && b.count==1)
}
print("PASS iOS request identity: late completion cannot settle reused ID; exactly once")
final class Image {var hidden=false}
struct Location {let course:Double}
final class User {var lastLocation:Location?;let locationImage=Image(),movementImage=Image(),accuracyCircle=Image()}
final class DemoDrawable {var userLocation:User?=User();var hidden=false}
final class View {
'''+visibility+'''
 func verify() {
  let d=DemoDrawable(),u=dummyUser()
  d.userLocation=u
  updateLocationVisibility(d)
  precondition(u.locationImage.hidden && u.movementImage.hidden && u.accuracyCircle.hidden)
  u.lastLocation=Location(course:-1);updateLocationVisibility(d)
  precondition(!u.locationImage.hidden && u.movementImage.hidden && !u.accuracyCircle.hidden)
  d.hidden=true;updateLocationVisibility(d)
  u.lastLocation=Location(course:45);updateLocationVisibility(d)
  precondition(u.locationImage.hidden && u.movementImage.hidden && u.accuracyCircle.hidden)
  d.hidden=false;updateLocationVisibility(d)
  precondition(u.locationImage.hidden && !u.movementImage.hidden && !u.accuracyCircle.hidden)
 }
 private func dummyUser()->User {User()}
}
View().verify()
print("PASS iOS user-location visibility: no-fix, hide, late fix and unhide bearing selection")
'''
    path=OUT/'Checks.swift';path.write_text(source)
    subprocess.run(['swiftc','-swift-version','5',str(path),'-o',str(OUT/'checks-swift')],check=True)
    subprocess.run([str(OUT/'checks-swift')],check=True)
if __name__=='__main__':
    for module,owner,api in [('glmap-core','CoreSdk','core'),('glsearch','SearchSdk','glsearch'),('glroute','RouteSdk','glroute')]:
        print('Checking',module,flush=True)
        main(module,owner,api)
