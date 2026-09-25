#!/usr/bin/env python3
"""Exercise production vector-completion settlement with controlled native outcomes."""
from pathlib import Path
import subprocess
import kotlin_runner as runner

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'build/vector-update-tests'
OUT.mkdir(parents=True, exist_ok=True)
runner.OUT = OUT
android = (ROOT / 'packages/glmap/android/src/main/java/software/globus/reactnative/glmap/DemoMapView.kt').read_text()
method = runner.declaration(android, 'private fun finishVectorUpdate(')
source = '''class GLMapVectorLayer { object UpdateResult {
 const val Ready=0; const val Superseded=1; const val Cancelled=2; const val Failed=3
} }
class DemoFailure(val code:String) { companion object {
 fun cancelled()=DemoFailure("cancelled");fun sdk(message:String)=DemoFailure("sdk_error")
} }
class Promise {var count=0; var error:String?=null; var value:Any?=null
 fun resolve(value:Any?) {this.value=value;count++}
 fun reject(error:DemoFailure) {this.error=error.code;count++}
}
class View {
 val pending=mutableSetOf<Promise>();val layers=mutableSetOf<Int>();var removals=0
 fun removeDrawable(id:Int) {if(layers.remove(id)) removals++}
''' + method + '''
 fun start(p:Promise,id:Int) {pending.add(p);layers.add(id)}
 fun complete(p:Promise,id:Int,result:Int) {finishVectorUpdate(p,id,null,result)}
 fun unmount() {pending.forEach {it.reject(DemoFailure("disposed"))};pending.clear();layers.clear()}
}
fun main() {
 for (outcome in listOf(0,1,2,3,99)) {
  val view=View();val p=Promise();view.start(p,7);check(p.count==0)
  view.complete(p,7,outcome);view.complete(p,7,0)
  check(p.count==1)
  if(outcome==0) {check(p.error==null && view.layers==setOf(7));check((p.value as Map<*,*>)["id"]==7)}
  else {check(p.error==if(outcome==1 || outcome==2) "cancelled" else "sdk_error");check(view.layers.isEmpty() && view.removals==1)}
 }
 val view=View();val old=Promise();view.start(old,1);view.unmount();view.unmount()
 val current=Promise();view.start(current,1)
 view.complete(old,1,0);view.complete(old,1,3)
 check(old.count==1 && old.error=="disposed" && current.count==0 && view.layers==setOf(1))
 view.complete(current,1,0);check(current.count==1 && current.error==null)
 println("PASS Android vector outcomes: Ready only, cancellation/failure cleanup, duplicates and late callbacks")
}
'''
runner.run_kotlin(source)
ios = (ROOT / 'packages/glmap/ios/DemoMapView.swift').read_text()
method = runner.declaration(ios, 'private func finishVectorUpdate(')
source = '''import Foundation
enum GLMapVectorLayerUpdateResult {case ready,superseded,cancelled,failed}
struct DemoFailure:Error {let code:String
 static let cancelled=Self(code:"cancelled");static let disposed=Self(code:"disposed")
 static func sdk(_ message:String)->Self {Self(code:"sdk_error")}
}
final class Promise {var count=0;var error:String?;var value:[String:Any?]?
 func resolve(_ value:[String:Any?]) {self.value=value;count+=1}
 func reject(_ error:DemoFailure) {self.error=error.code;count+=1}
}
final class View {
 var pending:[Int:Promise]=[:];var layers:Set<Int>=[];var removals=0
 func release(_ request:Int)->Promise? {pending.removeValue(forKey:request)}
 func removeDrawable(_ id:Int) {if layers.remove(id) != nil {removals+=1}}
''' + method + '''
 func start(_ request:Int,_ id:Int,_ promise:Promise) {pending[request]=promise;layers.insert(id)}
 func complete(_ request:Int,_ id:Int,_ outcome:GLMapVectorLayerUpdateResult) {finishVectorUpdate(request,id,nil,outcome)}
 func unmount() {pending.values.forEach {$0.reject(.disposed)};pending.removeAll();layers.removeAll()}
}
for outcome in [GLMapVectorLayerUpdateResult.ready,.superseded,.cancelled,.failed] {
 let view=View(),p=Promise();view.start(1,7,p);precondition(p.count==0)
 view.complete(1,7,outcome);view.complete(1,7,.ready)
 precondition(p.count==1)
 if outcome == .ready {precondition(p.error==nil && view.layers==[7]);precondition(p.value?["id"] as? Int == 7)}
 else {precondition(p.error==(outcome == .failed ? "sdk_error" : "cancelled"));precondition(view.layers.isEmpty && view.removals==1)}
}
let view=View(),old=Promise();view.start(1,7,old);view.unmount();view.unmount()
let current=Promise();view.start(2,7,current)
view.complete(1,7,.ready);view.complete(1,7,.failed)
precondition(old.count==1 && old.error=="disposed" && current.count==0 && view.layers==[7])
view.complete(2,7,.ready);precondition(current.count==1 && current.error==nil)
print("PASS iOS vector outcomes: Ready only, cancellation/failure cleanup, duplicates and late callbacks")
'''
path = OUT / 'Checks.swift'
path.write_text(source)
subprocess.run(['swiftc', '-swift-version', '5', str(path), '-o', str(OUT / 'checks-swift')], check=True)
subprocess.run([str(OUT / 'checks-swift')], check=True)
# Both geometry paths must retain the promise until the result callback, not merely until file I/O.
assert 'finishVectorUpdate(promise, handle, bounds, outcome)' in android
assert 'finishVectorUpdate(token, id, bounds, outcome)' in ios
assert 'promise.resolve(show(objects))' not in android + ios
print('PASS: public vector creation is connected to status-bearing native completion')
