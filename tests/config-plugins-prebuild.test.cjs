const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const plist = require('@expo/plist').default;
const xcode = require('xcode');
const root = path.resolve(__dirname, '..');
const packages = ['glmap-core', 'glmap', 'glsearch', 'glroute'];
const frameworks = ['GLMapCore.framework', 'GLMap.framework', 'GLSearch.framework', 'GLRoute.framework'];

function app(t, infoPlist = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'glmap-prebuild-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  const examplePackage = JSON.parse(fs.readFileSync(path.join(root, 'example/package.json'), 'utf8'));
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
    name: 'glmap-prebuild-test', version: '0.0.0', private: true, main: 'index.js',
    dependencies: examplePackage.dependencies,
  }));
  fs.writeFileSync(path.join(directory, 'index.js'), "import { registerRootComponent } from 'expo'; registerRootComponent(() => null);\n");
  const config = {
    name: 'HostOwnership', slug: 'host-ownership',
    ios: { bundleIdentifier: 'software.globus.tests.hostownership', infoPlist },
    android: { package: 'software.globus.tests.hostownership' },
    plugins: [],
  };
  const read = file => fs.readFileSync(path.join(directory, file), 'utf8');
  function prebuild(platform = 'ios') {
    fs.writeFileSync(path.join(directory, 'app.json'), JSON.stringify({ expo: config }));
    execFileSync(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'prebuild',
      '--platform', platform, '--no-install', '--no-clean',
      '--template', path.join(root, 'node_modules/expo/template.tgz')], {
      cwd: directory, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1' },
      stdio: 'pipe',
    });
  }
  return {
    directory, config, prebuild, read,
    delegate: () => read('ios/HostOwnership/AppDelegate.swift'),
    // Compare plist values, not the parser's null-prototype dictionaries.
    info: () => JSON.parse(JSON.stringify(plist.parse(read('ios/HostOwnership/Info.plist')))),
    embedded: () => {
      const project = xcode.project(path.join(directory, 'ios/HostOwnership.xcodeproj/project.pbxproj'));
      project.parseSync();
      const objects = project.hash.project.objects;
      const phase = project.buildPhaseObject('PBXCopyFilesBuildPhase', 'Embed GLMap Frameworks', project.getFirstTarget().uuid);
      return phase.files.map(({ value }) => objects.PBXFileReference[objects.PBXBuildFile[value].fileRef].path.replace(/^"|"$/g, '')).sort();
    },
  };
}

for (const [index, name] of packages.entries()) {
  test(`Expo prebuild: ${name} preserves a custom iOS host and still embeds only its frameworks`, t => {
    const custom = {
      NSLocationWhenInUseUsageDescription: 'Find nearby delivery stops while using this app.',
      UIApplicationSceneManifest: {
        UIApplicationSupportsMultipleScenes: true,
        UISceneConfigurations: { UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Customer Scene',
          UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).CustomerSceneDelegate',
          UISceneStoryboardFile: 'CustomerStoryboard',
        }] },
      },
    };
    const fixture = app(t, custom);
    fixture.prebuild();
    const delegate = fixture.delegate().replace('    window = UIWindow',
      '    // Customer startup configuration must survive GLMap prebuild.\n    window = UIWindow');
    fs.writeFileSync(path.join(fixture.directory, 'ios/HostOwnership/AppDelegate.swift'), delegate);
    fixture.config.plugins = ['@globus-software/' + name];
    fixture.prebuild();
    assert.equal(fixture.delegate(), delegate);
    for (const key of Object.keys(custom)) assert.deepEqual(fixture.info()[key], custom[key]);
    const expected = index === 0 ? [frameworks[0]] : [frameworks[0], frameworks[index]].sort();
    assert.deepEqual(fixture.embedded(), expected);
    assert.match(fixture.read('ios/Podfile'), /GLMap: collision-safe IDs/);
    fixture.prebuild();
    assert.equal(fixture.delegate(), delegate, 'repeated prebuild preserves custom startup');
    for (const key of Object.keys(custom)) assert.deepEqual(fixture.info()[key], custom[key]);
    assert.deepEqual(fixture.embedded(), expected, 'framework embedding remains idempotent');
  });
}

test('Expo prebuild: a map/search/route app does not acquire a location prompt or scene migration', t => {
  const fixture = app(t);
  fixture.prebuild();
  const delegate = fixture.delegate();
  const info = fixture.info();
  fixture.config.plugins = packages.map(name => '@globus-software/' + name);
  fixture.prebuild('all');
  assert.equal(fixture.delegate(), delegate);
  for (const key of ['NSLocationWhenInUseUsageDescription', 'UIApplicationSceneManifest']) {
    assert.deepEqual(fixture.info()[key], info[key]);
  }
  assert.deepEqual(fixture.embedded(), frameworks.slice().sort());
  assert.match(fixture.read('android/build.gradle'), /ext.ndkVersion = '29.0.14206865'/);
  assert.match(fixture.read('android/app/build.gradle'), /noCompress \+= \['vm', 'ttf', 'otf'\]/);
});

test('generated headless probes explicitly own their scene setup without requesting location', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'glmap-probes-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  execFileSync('python3', [path.join(root, 'scripts/create-headless-probes.py'), '--output', directory],
    { cwd: root, timeout: 120000, stdio: 'pipe' });
  const demo = JSON.parse(fs.readFileSync(path.join(root, 'example/app.json'), 'utf8')).expo;
  const migration = fs.readFileSync(path.join(root, 'example/plugins/with-expo-scenes.js'), 'utf8');
  for (const [name, module] of [['core', 'glmap-core'], ['search', 'glsearch'], ['route', 'glroute']]) {
    const config = JSON.parse(fs.readFileSync(path.join(directory, name, 'app.json'), 'utf8')).expo;
    assert.ok(config.plugins.includes('@globus-software/' + module));
    assert.ok(config.plugins.includes('./with-expo-scenes'));
    assert.deepEqual(config.ios.infoPlist.UIApplicationSceneManifest, demo.ios.infoPlist.UIApplicationSceneManifest);
    assert.equal(config.ios.infoPlist.NSLocationWhenInUseUsageDescription, undefined);
    assert.equal(fs.readFileSync(path.join(directory, name, 'with-expo-scenes.js'), 'utf8'), migration);
  }
});

test('Expo prebuild: the demo explicitly opts into scenes and keeps its own location prompt', t => {
  const fixture = app(t);
  const demo = JSON.parse(fs.readFileSync(path.join(root, 'example/app.json'), 'utf8')).expo;
  fixture.config.ios.infoPlist = demo.ios.infoPlist;
  fixture.config.plugins = demo.plugins;
  fs.symlinkSync(path.join(root, 'example/plugins'), path.join(fixture.directory, 'plugins'), 'dir');
  fixture.prebuild('all');
  const delegate = fixture.delegate();
  assert.match(delegate, /class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider/);
  assert.doesNotMatch(delegate, /window = UIWindow\(|factory\.startReactNative\(/);
  assert.match(delegate, /reactNativeFactory = factory/);
  assert.match(delegate, /RCTLinkingManager\.application/);
  for (const key of Object.keys(demo.ios.infoPlist)) assert.deepEqual(fixture.info()[key], demo.ios.infoPlist[key]);
  assert.deepEqual(fixture.embedded(), frameworks.slice().sort());
  fixture.prebuild();
  assert.equal(fixture.delegate(), delegate);
  assert.deepEqual(fixture.embedded(), frameworks.slice().sort());
});
