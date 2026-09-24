const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function load(name, requireModule, globals = {}) {
  const output = ts.transpileModule(read(name), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: requireModule, ...globals }, { filename: name });
  return module.exports;
}
const entry = load('example/entry-mode.ts', () => { throw new Error('Unexpected dependency'); });

function boot(env = {}) {
  const imports = [];
  let component;
  load('example/index.ts', name => {
    if (name === 'expo') return { registerRootComponent: value => { component = value; } };
    if (name === './entry-mode') return entry;
    imports.push(name);
    return { default: name };
  }, { process: { env } });
  return { component, imports };
}

test('normal startup loads only the catalog entry, without private benchmark bindings', () => {
  assert.deepEqual(boot(), { component: './App', imports: ['./App'] });
  assert.match(read('example/App.tsx'), /export \{ default \} from '\.\/DemoApp'/);
});

test('each diagnostic entry is explicit and only its root is evaluated', () => {
  for (const [flag, component] of [
    ['EXPO_PUBLIC_GLMAP_API_TESTS', './DemoApiChecks'],
    ['EXPO_PUBLIC_GLMAP_LIFECYCLE', './LifecycleApp'],
    ['EXPO_PUBLIC_GLMAP_BENCH', './BenchmarkApp'],
  ]) assert.deepEqual(boot({ [flag]: '1' }), { component, imports: [component] });
  assert.equal(boot({ EXPO_PUBLIC_GLMAP_API_TESTS: '0' }).component, './App');
});

test('conflicting diagnostic modes are rejected rather than silently selected', () => {
  assert.throws(() => boot({ EXPO_PUBLIC_GLMAP_API_TESTS: '1', EXPO_PUBLIC_GLMAP_BENCH: '1' }), /only one/);
  assert.throws(() => entry.selectEntryMode({ lifecycle: '1', benchmark: '1' }), /only one/);
});

test('public examples and lifecycle checks cannot import the private benchmark view', () => {
  for (const name of ['example/LifecycleApp.tsx', 'example/DemoApiChecks.tsx', 'example/tests/lifecycleChecks.ts']) {
    const source = read(name);
    assert.match(source, /from ['"]@globus-software\/glmap['"]/);
    assert.doesNotMatch(source, /requireNativeViewManager|GLMapTestSupportView|src\/benchmark|\.diagnostics\(|\.mutateVectorLayer\(/);
  }
  assert.doesNotMatch(read('example/modules/glmap-test-support/src/index.ts'), /requireNativeViewManager/);
  assert.match(read('example/BenchmarkApp.tsx'), /from '\.\/modules\/glmap-test-support\/src\/benchmark'/);
});

test('Expo identifiers and native test-support registration agree', () => {
  const app = JSON.parse(read('example/app.json')).expo;
  const name = 'software.globus.glmap.reactnative.demo';
  assert.equal(app.ios.bundleIdentifier, name);
  assert.equal(app.android.package, name);
  assert.equal(app.name, 'GLMap React Native Demo');
  assert.equal(app.scheme, 'glmap-rn-demo');
  assert.deepEqual(app.platforms.sort(), ['android', 'ios']);
  const module = JSON.parse(read('example/modules/glmap-test-support/expo-module.config.json'));
  assert.deepEqual(module.apple.modules, ['GLMapTestSupportModule']);
  assert.deepEqual(module.android.modules, ['software.globus.reactnative.testsupport.GLMapTestSupportModule']);
  for (const file of [
    'example/modules/glmap-test-support/android/src/main/java/software/globus/reactnative/testsupport/GLMapTestSupportModule.kt',
    'example/modules/glmap-test-support/ios/GLMapTestSupportModule.swift',
  ]) {
    const source = read(file);
    assert.match(source, /Name\("GLMapTestSupport"\)/);
    assert.match(source, /saveLifecycleResults/);
    assert.match(source, /Benchmark map/);
    assert.doesNotMatch(source, /GLMap canvas|GLMapLab|LabBenchmark|software\.globus\.lab/);
  }
  assert.match(read('example/tests/ios/MapUiTests.swift'), new RegExp(name.replaceAll('.', '\\.')));
  assert.match(read('example/tests/ios/project.yml'), /name: GLMapDemoUITests/);
});

function helpers() {
  const timers = new Map();
  let next = 0;
  const exports = load('example/tests/lifecycleChecks.ts', name => {
    if (name === '@globus-software/glmap-core') return { errorCode: error => error?.code };
    if (name.endsWith('stage-a.json')) return JSON.parse(read('example/assets/stage-a.json'));
    throw new Error(`Unexpected dependency ${name}`);
  }, {
    setTimeout: fn => { timers.set(++next, fn); return next; },
    clearTimeout: id => timers.delete(id),
  });
  return { ...exports, timers };
}

test('bounded operations clear timers on success and failure', async () => {
  const { bounded, timers } = helpers();
  const signal = new AbortController().signal;
  assert.equal(await bounded(Promise.resolve(42), signal, 'success'), 42);
  assert.equal(timers.size, 0);
  await assert.rejects(bounded(Promise.reject(new Error('native failure')), signal, 'failure'), /native failure/);
  assert.equal(timers.size, 0);
});

test('screen cancellation settles once and handles late native completion', async () => {
  const { bounded, timers } = helpers();
  const controller = new AbortController();
  let finish;
  const native = new Promise(resolve => { finish = resolve; });
  const pending = bounded(native, controller.signal, 'removed map');
  controller.abort();
  await assert.rejects(pending, /Cancelled/);
  assert.equal(timers.size, 0);
  finish(42);
  await Promise.resolve();
  assert.equal(timers.size, 0);
});

test('timeout clears its timer and does not leak an unhandled late rejection', async () => {
  const { bounded, timers } = helpers();
  let fail;
  const pending = bounded(new Promise((_, reject) => { fail = reject; }), new AbortController().signal, 'capture');
  timers.values().next().value();
  await assert.rejects(pending, /Timeout: capture/);
  assert.equal(timers.size, 0);
  fail(new Error('late callback'));
  await Promise.resolve();
});

test('already-cancelled operations and map waits reject immediately', async () => {
  const { bounded, waitFor, timers } = helpers();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(bounded(Promise.resolve(1), controller.signal, 'capture'), /Cancelled/);
  await assert.rejects(waitFor(() => undefined, controller.signal, 'ready'), /Cancelled/);
  assert.equal(timers.size, 0);
});
