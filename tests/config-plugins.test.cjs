const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const packages = ['glmap-core', 'glmap', 'glsearch', 'glroute'];
const { migrateAppDelegate } = require('../example/plugins/with-expo-scenes');
const template = execFileSync('tar', ['-xOf', path.join(root, 'node_modules/expo/template.tgz'),
  'package/ios/HelloWorld/AppDelegate.swift'], { encoding: 'utf8' });

for (const name of packages) {
  test(`${name} leaves permission/scene settings alone and never registers AppDelegate or Info.plist mods`, () => {
    const plugin = require(`../packages/${name}/app.plugin.js`);
    for (const infoPlist of [undefined, {}, {
      NSLocationWhenInUseUsageDescription: 'Customer-specific explanation',
      UIApplicationSceneManifest: {
        UIApplicationSupportsMultipleScenes: true,
        UISceneConfigurations: { UIWindowSceneSessionRoleApplication: [
          { UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).CustomerSceneDelegate' },
        ] },
      },
    }]) {
      const config = { name: 'Consumer', slug: 'consumer', ios: { infoPlist } };
      const expected = structuredClone(config.ios);
      const result = plugin(config);
      assert.deepEqual(result.ios, expected);
      assert.equal(result.mods.ios.infoPlist, undefined);
      assert.equal(result.mods.ios.appDelegate, undefined);
      assert.ok(result.mods.ios.xcodeproj, 'still embeds the native frameworks');
      assert.ok(result.mods.ios.podfile, 'still configures SwiftPM/CocoaPods integration');
    }
  });
}

test('all feature plugins compose without taking over the host lifecycle', () => {
  const ios = { infoPlist: { NSLocationWhenInUseUsageDescription: 'Keep me' } };
  let config = { name: 'Consumer', slug: 'consumer', ios: structuredClone(ios) };
  for (let i = 0; i < 2; i++) {
    for (const name of packages) config = require(`../packages/${name}/app.plugin.js`)(config);
  }
  assert.deepEqual(config.ios, ios);
  assert.equal(config.mods.ios.infoPlist, undefined);
  assert.equal(config.mods.ios.appDelegate, undefined);
});

test('SDK plugins preserve previously registered host-owned mods', () => {
  const appDelegate = config => config;
  const infoPlist = config => config;
  let config = { name: 'Consumer', slug: 'consumer', mods: { ios: { appDelegate, infoPlist } } };
  for (const name of packages) config = require(`../packages/${name}/app.plugin.js`)(config);
  assert.equal(config.mods.ios.appDelegate, appDelegate);
  assert.equal(config.mods.ios.infoPlist, infoPlist);
});

test('demo explicitly owns permissions, scene configuration and its private migration plugin', () => {
  const demo = JSON.parse(fs.readFileSync(path.join(root, 'example/app.json'), 'utf8')).expo;
  assert.ok(demo.ios.infoPlist.NSLocationWhenInUseUsageDescription);
  assert.equal(demo.ios.infoPlist.UIApplicationSceneManifest.UISceneConfigurations
    .UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName, 'EXExpoAppSceneDelegate');
  assert.ok(demo.plugins.includes('./plugins/with-expo-scenes'));
});

test('demo scene migration handles the actual pinned Expo template and is idempotent', () => {
  const migrated = migrateAppDelegate(template, 'swift');
  assert.match(migrated, /class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider/);
  assert.doesNotMatch(migrated, /window = UIWindow\(|factory\.startReactNative\(/);
  assert.match(migrated, /reactNativeFactory = factory/);
  assert.match(migrated, /RCTLinkingManager\.application/);
  assert.equal(migrateAppDelegate(migrated, 'swift'), migrated);
});

test('demo scene migration fails closed on unknown, customized or partly migrated startup code', () => {
  for (const source of [
    template.replace('class AppDelegate: ExpoAppDelegate {', 'class AppDelegate: CustomAppDelegate {'),
    template.replace('    window = UIWindow', '    configureCustomerServices()\n    window = UIWindow'),
    template.replace('withModuleName: "main"', 'withModuleName: "customer"'),
    template.replace('class AppDelegate: ExpoAppDelegate {',
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'),
  ]) assert.throws(() => migrateAppDelegate(source, 'swift'), /Unexpected Expo AppDelegate/);
  assert.throws(() => migrateAppDelegate('@implementation AppDelegate', 'objc'), /only.*Swift/);
});
