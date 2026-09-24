import React, { useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GLMap, GLMapRef, lab } from "./modules/glmap-test-support/src";
import fixture from './assets/stage-a.json';

type BenchRef = GLMapRef & {
  benchEcho(sequence: number): Promise<number>;
  benchPayload(values: number[]): Promise<number[]>;
  benchGeometry(values: number[]): Promise<number[]>;
  benchPayloadBuffer(values: Float64Array | Uint8Array): Promise<number[]>;
  benchGeometryBuffer(values: Float64Array | Uint8Array): Promise<number[]>;
  benchNative(points: number): Promise<number[]>;
  benchRestyle(alternate: boolean): Promise<number[]>;
  benchStatus(): Promise<number[]>;
  benchReadback(): Promise<string>;
};
type Row = { run: number; path: string; points: number; roundTripMicros: number[];
  nativeHandlerMicros: (number | null)[]; geometryMicros: (number | null)[];
  nativeReadyMicros: number[]; observedReadyMicros: number[] };
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const assert = (ok: boolean, message: string) => { if (!ok) throw Error(message); };

export default function BenchmarkApp() {
  const ref = useRef<GLMapRef>(null), started = useRef(false);
  const [status, setStatus] = useState('Preparing benchmark');
  return <SafeAreaProvider><SafeAreaView style={{flex: 1}}>
    <Text style={{padding: 12}}>{status}</Text>
    <View style={{flex: 1}}><GLMap ref={ref} style={{flex: 1}} fixture={JSON.stringify(fixture)}
      onReady={() => {
        if (started.current) return;
        started.current = true;
        void delay(2000).then(() => run(ref.current as BenchRef, setStatus));
      }} onFailure={e => setStatus('NATIVE ERROR: ' + e.nativeEvent.message)} /></View>
  </SafeAreaView></SafeAreaProvider>;
}

async function run(map: BenchRef, status: (value: string) => void) {
  const rows: Row[] = [], validation: object[] = [], preparation: object[] = [];
  const report = {
    schema: 2, experiment: 'react-native-transport', startedUtc: new Date().toISOString(),
    completedUtc: '', passed: false, error: '', platform: Platform.OS, osVersion: Platform.Version,
    mode: __DEV__ ? 'debug' : 'release', expo: '57.0.23', reactNative: '0.86.3',
    hermes: !!(globalThis as any).HermesInternal, fabric: !!(globalThis as any).nativeFabricUIManager,
    rounds: 5, geometrySamplesPerCell: 15, nativeSdk: 'Release c37ee42cca7929a428fee2a307d20ec319888884',
    rows, validation, preparation,
  };
  const inputs = new Map<number, number[]>();
  const buffers = new Map<number, Float64Array>();
  const started = performance.now;
  const elapsed = (t: number) => (performance.now() - t) * 1000;
  async function settle(revision: number) {
    const start = performance.now();
    while (performance.now() - start < 25000) {
      const s = await map.benchStatus();
      if (s[0] === revision) {
        assert(s[2] === 1, `Revision ${revision} was not Ready: ${s[2]}`);
        return s[1];
      }
      await delay(2);
    }
    throw Error(`Revision ${revision} timed out`);
  }
  async function validate(path: string, n: number) {
    const document = JSON.parse(await map.benchReadback());
    const geometry = document.type === 'Feature' ? document.geometry : document;
    const points = geometry.type === 'MultiLineString' ? geometry.coordinates[0] : geometry.coordinates;
    assert(points.length === n, `Readback count ${points.length} != ${n}`);
    let maxError = 0;
    for (let i = 0; i < n; i++) for (let axis = 0; axis < 2; axis++) {
      maxError = Math.max(maxError, Math.abs(points[i][axis] - inputs.get(n)![i * 2 + axis]));
    }
    assert(maxError <= .000002, `Readback coordinate error ${maxError}`);
    validation.push({path, points: n, maxCoordinateErrorDegrees: maxError});
  }
  async function measure(run: number, path: string, n: number, count: number,
    call: (i: number) => Promise<number[]>, expected: number, geometry = false, nativeTiming = true) {
    const check = async (reply: number[]) => {
      assert(Math.abs(reply[0] - expected) <= Math.max(.001, Math.abs(expected) * 1e-10), `${path}: incorrect reply`);
      if (geometry) return settle(reply[2]);
      return 0;
    };
    for (let i = 0; i < (geometry ? 3 : 30); i++) await check(await call(i));
    if (geometry && run === 0) await validate(path, n);
    status(`Round ${run + 1}/5 · ${path} · ${n}`);
    await delay(100);
    const row: Row = {run, path, points: n, roundTripMicros: [], nativeHandlerMicros: [],
      geometryMicros: [], nativeReadyMicros: [], observedReadyMicros: []};
    for (let i = 0; i < count; i++) {
      const t = started();
      const reply = await call(i);
      row.roundTripMicros.push(elapsed(t));
      row.nativeHandlerMicros.push(nativeTiming ? reply[1] : null);
      row.geometryMicros.push(nativeTiming ? reply[3] : null);
      const ready = await check(reply);
      if (geometry) { row.nativeReadyMicros.push(ready); row.observedReadyMicros.push(elapsed(t)); }
      if (i % 20 === 19) await delay(0);
    }
    rows.push(row);
  }
  try {
    assert(!__DEV__, 'Performance suite requires a Release app');
    for (const n of [1000, 10000, 100000]) {
      const t = started(), values = new Array<number>(n * 2);
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        values[2*i] = 13 + u * 6; values[2*i+1] = 49 + Math.sin(u * Math.PI * 8) * .2;
      }
      preparation.push({points: n, bytes: n * 16, jsArrayBuildMicros: elapsed(t)});
      inputs.set(n, values);
      const copyStart = started();
      buffers.set(n, new Float64Array(values));
      preparation.push({points: n, jsArrayToFloat64Micros: elapsed(copyStart)});
    }
    await map.setCamera({latitude: 49, longitude: 16, zoom: 5});
    const camera = await map.captureState();
    assert(Math.abs(camera.latitude - 49) < .05 && Math.abs(camera.longitude - 16) < .05 && camera.zoom === 5,
      'Initial native camera mismatch');
    validation.push({camera});
    for (let round = 0; round < 5; round++) {
      await measure(round, 'echo', 0, 300, async i => [(await map.benchEcho(i)) - i, 0, 0, 0], 0, false, false);
      await measure(round, 'setCamera', 0, 100, async i => {
        await map.setCamera({latitude: 49 + (i % 2) * .001, longitude: 16, zoom: 5}); return [0, 0, 0, 0];
      }, 0, false, false);
      await measure(round, 'captureState', 0, 100, async () => {
        const c = await map.captureState(); assert(c.zoom === 5 && Math.abs(c.longitude - 16) < .05, 'Camera snapshot mismatch');
        return [0, 0, 0, 0];
      }, 0, false, false);
      for (const [n, values] of inputs) {
        await measure(round, 'payloadArray', n, 30, () => map.benchPayload(values), values.reduce((a,b) => a+b, 0));
        await measure(round, 'payloadBuffer', n, 30, () => map.benchPayloadBuffer(buffers.get(n)!), values.reduce((a,b) => a+b, 0));
        const paths: [string, () => Promise<number[]>][] = [
          ['geometryArray', () => map.benchGeometry(values)],
          ['geometryBuffer', () => map.benchGeometryBuffer(buffers.get(n)!)],
          ['geometryBufferFromArray', () => map.benchGeometryBuffer(new Float64Array(values))],
          ['geometryNative', () => map.benchNative(n)],
        ];
        for (let k = 0; k < paths.length; k++) {
          const [path, call] = paths[(round + k) % paths.length];
          await measure(round, path, n, 15, call, 1, true);
        }
        await measure(round, 'restyle', n, 15, i => map.benchRestyle(i % 2 === 1), 1, true);
      }
    }
    const temporary = inputs.get(1000)!.slice();
    const submitted = await map.benchGeometry(temporary);
    temporary.fill(0); await settle(submitted[2]); await validate('ownedAfterSubmission', 1000);
    let rejected = false;
    try { await map.benchGeometry([13, NaN, 14, 49]); } catch { rejected = true; }
    assert(rejected, 'Invalid input was accepted');
    await validate('unchangedAfterInvalidInput', 1000);
    const recovered = await map.benchGeometry(inputs.get(1000)!);
    await settle(recovered[2]); await validate('recoveredAfterInvalidInput', 1000);
    // A typed subview must not expose the sentinel bytes outside its range.
    const backing = new Float64Array(2004); backing.fill(NaN);
    const view = backing.subarray(2, 2002); view.set(inputs.get(1000)!);
    const buffered = await map.benchGeometryBuffer(view);
    // The caller may reuse input after submission resolves, before Ready.
    backing.fill(0); await settle(buffered[2]); await validate('bufferSubviewOwnedAfterSubmission', 1000);
    for (const invalid of [new Uint8Array(7), new Float64Array([13, 49, 14]), new Float64Array([13, NaN, 14, 49])]) {
      let failed = false;
      try { await map.benchGeometryBuffer(invalid); } catch { failed = true; }
      assert(failed, 'Invalid buffer accepted');
      await validate('bufferUnchangedAfterInvalidInput', 1000);
    }
    const validBuffer = await map.benchGeometryBuffer(buffers.get(1000)!);
    await settle(validBuffer[2]); await validate('bufferRecoveredAfterInvalidInput', 1000);
    report.passed = true;
  } catch (error) { report.error = String(error); }
  report.completedUtc = new Date().toISOString();
  await lab.saveBenchmarkResults(JSON.stringify(report));
  status(report.passed ? 'DONE: React Native transport benchmark' : 'FAILED: ' + report.error);
  console.log('GLMAP_RN_BENCH_DONE', report.passed, report.error);
}
