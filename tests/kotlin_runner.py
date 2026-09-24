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
def run_kotlin(source, main_class="ChecksKt"):
    cache=Path(os.environ.get('GRADLE_USER_HOME',Path.home()/'.gradle'))/'caches/modules-2/files-2.1'
    def jar(group,artifact,version):return str(next((cache/group/artifact/version).glob(f'*/{artifact}-{version}.jar')))
    version='2.4.20'; ns={'m':'http://maven.apache.org/POM/4.0.0'}
    pom=next((cache/'org.jetbrains.kotlin/kotlin-compiler-embeddable'/version).glob('*/*.pom'))
    deps=[jar(*(d.findtext(f'm:{n}',namespaces=ns) for n in ('groupId','artifactId','version'))) for d in ET.parse(pom).findall('m:dependencies/m:dependency',ns)]
    compiler=jar('org.jetbrains.kotlin','kotlin-compiler-embeddable',version)
    runtime=[jar('org.jetbrains.kotlin','kotlin-stdlib',version),jar('org.jetbrains','annotations','13.0'),jar('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm','1.10.2')]
    path=OUT/'Checks.kt';path.write_text(source)
    subprocess.run(['java','-cp',os.pathsep.join([compiler,*deps,*runtime]),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',os.pathsep.join(runtime),'-d',str(OUT/'checks.jar'),str(path)],check=True)
    subprocess.run(['java','-cp',os.pathsep.join([str(OUT/'checks.jar'),*runtime]),main_class],check=True)
