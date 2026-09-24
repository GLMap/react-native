import { errorCode } from '@globus-software/glmap-core';
import type { GLMapViewRef, MapState } from '@globus-software/glmap';
import fixture from '../assets/stage-a.json';

export type CheckResult = {
  name: string;
  passed: boolean;
  milliseconds: number;
  error?: string;
};

export interface LifecycleHost {
  current(): GLMapViewRef;
  replace(): Promise<GLMapViewRef>;
  unmount(): Promise<void>;
  second(): Promise<GLMapViewRef>;
  closeSecond(): Promise<void>;
}

export function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

export function bounded<T>(task: Promise<T>, signal: AbortSignal, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true; cleanup(); reject(error);
    };
    const abort = () => fail(new Error(`Cancelled: ${label}`));
    const timer = setTimeout(() => fail(new Error(`Timeout: ${label}`)), 25000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    task.then(value => {
      if (!settled) { settled = true; cleanup(); resolve(value); }
    }, fail);
  });
}

export async function waitFor<T>(read: () => T | undefined, signal: AbortSignal, label: string): Promise<T> {
  const deadline = Date.now() + 25000;
  while (!signal.aborted && Date.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`${signal.aborted ? 'Cancelled' : 'Timeout'}: ${label}`);
}

export async function restoreCamera(view: GLMapViewRef, state: MapState) {
  await view.setOptions({ origin: { x: state.originX, y: state.originY } });
  await view.moveCamera({
    center: { latitude: state.latitude, longitude: state.longitude },
    zoom: state.zoom, angle: state.angle, pitch: state.pitch,
  }, null);
}

function near(actual: number, expected: number, tolerance = 0.001) {
  check(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

async function rejects(task: Promise<unknown>, code: string) {
  try { await task; } catch (error) {
    check(errorCode(error) === code, `Expected ${code}, received ${String(error)}`);
    return;
  }
  throw new Error(`Expected ${code}`);
}

export async function runLifecycleChecks(
  host: LifecycleHost,
  signal: AbortSignal,
  onStatus: (name: string) => void,
  onResult: (result: CheckResult) => void,
) {
  async function test(name: string, action: () => Promise<void>) {
    if (signal.aborted) throw new Error('Lifecycle checks cancelled');
    onStatus(name);
    const start = performance.now();
    try {
      await bounded(action(), signal, name);
      onResult({ name, passed: true, milliseconds: performance.now() - start });
    } catch (error) {
      onResult({ name, passed: false, milliseconds: performance.now() - start, error: String(error) });
      throw error;
    }
  }
  let view = host.current();
  await view.moveCamera({ center: fixture.camera, zoom: fixture.camera.zoom, angle: 0, pitch: 0 }, null);

  await test('Public map fixture and camera snapshot', async () => {
    const state = await view.captureState();
    near(state.latitude, fixture.camera.latitude, 0.05);
    near(state.longitude, fixture.camera.longitude, 0.05);
    near(state.zoom, fixture.camera.zoom);
    check(Object.values(state).every(Number.isFinite), 'Non-finite camera state');
  });
  await test('Camera validation and 20 concurrent captures', async () => {
    await view.moveCamera({ center: { latitude: 48.2082, longitude: 16.3738 }, zoom: 12, angle: 24, pitch: 20 }, null);
    const states = await Promise.all(Array.from({ length: 20 }, () => view.captureState()));
    for (const state of states) {
      near(state.latitude, 48.2082); near(state.longitude, 16.3738);
      near(state.zoom, 12); near(state.angle, 24); near(state.pitch, 20);
    }
    await rejects(view.moveCamera({ center: { latitude: 100, longitude: 0 } }, null), 'invalid_argument');
  });
  await test('Public vector ownership, picking and invalid input', async () => {
    const points = new Float64Array([19.25, 42.43, 19.27, 42.44]);
    await view.moveCamera({ center: { latitude: 42.43, longitude: 19.25 }, zoom: 14, angle: 0, pitch: 0 }, null);
    const layer = await view.addVectorLayer({ source: { line: points }, style: 'line{width:4pt;color:red;}', drawOrder: 3 });
    try {
      const [x, y] = await view.project(points.subarray(0, 2));
      points.fill(0);
      const json = await view.pickVectorObject(layer.id, x, y, 24);
      check(json, 'Owned geometry cannot be picked');
      const object = JSON.parse(json);
      const values: number[] = (object.geometry?.coordinates ?? object.coordinates).flat(Infinity);
      check(values.some((value, i) => i % 2 === 0 && Math.abs(value - 19.25) < 0.000002 && Math.abs(values[i + 1] - 42.43) < 0.000002), 'Geometry retained caller storage');
      await rejects(view.addVectorLayer({ source: { line: [1, 2, 3] }, style: 'line{width:4pt;color:red;}', drawOrder: 3 }), 'invalid_argument');
    } finally { await view.removeDrawable(layer.id); }
    const image = await view.addImage({ ...fixture.marker, image: { svg: 'pin.svg', scale: 1 }, anchor: 'bottom', drawOrder: 4 });
    await image.remove(); await image.remove();
    await rejects(image.update({ scale: 2 }), 'not_found');
  });
  await test('Two public maps remain independent', async () => {
    const other = await host.second();
    try {
      const before = await view.captureState();
      await other.moveCamera({ center: { latitude: 51.5, longitude: -0.12 }, zoom: 10 }, null);
      const after = await view.captureState();
      near(after.latitude, before.latitude); near(after.longitude, before.longitude); near(after.zoom, before.zoom);
    } finally { await host.closeSecond(); }
    await rejects(other.captureState(), 'disposed');
    await view.captureState();
  });
  await test('Camera restoration after unmount', async () => {
    const saved = await view.captureState();
    await host.unmount();
    view = await host.replace();
    await restoreCamera(view, saved);
    const restored = await view.captureState();
    for (const key of ['latitude', 'longitude', 'zoom', 'angle', 'pitch', 'originX', 'originY'] as const) near(restored[key], saved[key]);
  });
  await test('Ten unmount and recreation cycles', async () => {
    for (let i = 0; i < 10; i++) {
      if (signal.aborted) throw new Error('Lifecycle checks cancelled');
      const previous = view;
      view = await host.replace();
      await rejects(previous.captureState(), 'disposed');
      const state = await view.captureState();
      near(state.latitude, fixture.camera.latitude, 0.05); near(state.longitude, fixture.camera.longitude, 0.05); near(state.zoom, fixture.camera.zoom);
    }
  });
  await test('Unmount invalidates retained public drawable handles', async () => {
    const image = await view.addImage({ ...fixture.marker, image: { svg: 'pin.svg', scale: 1 }, anchor: 'bottom', drawOrder: 4 });
    await host.unmount();
    await rejects(image.update({ scale: 2 }), 'disposed');
    await rejects(view.captureState(), 'disposed');
    view = await host.replace();
  });
  await test('Unmount settles concurrent public captures', async () => {
    const pending = Array.from({ length: 20 }, () => view.captureState().then(
      state => { check(Number.isFinite(state.zoom), 'Invalid completed capture'); },
      error => { check(errorCode(error) === 'disposed', `Unexpected rejection: ${String(error)}`); },
    ));
    await host.unmount();
    await Promise.all(pending);
    view = await host.replace();
    await view.captureState();
  });
}
