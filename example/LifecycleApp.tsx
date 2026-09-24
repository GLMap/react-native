import React, { useEffect, useRef, useState } from 'react';
import { Button, Keyboard, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { errorCode, GLMapSdk } from '@globus-software/glmap-core';
import { GLMapView, type GLMapViewRef, type MapState } from '@globus-software/glmap';
import { testSupport } from './modules/glmap-test-support';
import { bounded, check, restoreCamera, runLifecycleChecks, waitFor, type CheckResult, type LifecycleHost } from './tests/lifecycleChecks';
import fixture from './assets/stage-a.json';

type Props = { apiKey?: string; onBack?: () => void };

/** The lifecycle sample and native UI tests use only the published map API. */
export default function LifecycleApp({ apiKey = '', onBack }: Props) {
  const map = useRef<GLMapViewRef>(null);
  const second = useRef<GLMapViewRef>(null);
  const lifetime = useRef(new AbortController());
  const configured = useRef(new WeakSet<GLMapViewRef>());
  const configuring = useRef(new WeakSet<GLMapViewRef>());
  const started = useRef(false);
  const running = useRef(false);
  const savedCamera = useRef<MapState | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [visible, setVisible] = useState(true);
  const [showSecond, setShowSecond] = useState(false);
  const [overlay, setOverlay] = useState(true);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState('Initializing Core…');
  const [text, setText] = useState('');
  const [taps, setTaps] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void (async () => {
      try {
        await GLMapSdk.initialize(apiKey);
        if (controller.signal.aborted) return;
        await GLMapSdk.setTileDownloadingAllowed(false);
        if (!controller.signal.aborted) setInitialized(true);
      } catch (error) {
        if (!controller.signal.aborted) { setStatus(`FAIL: ${String(error)}`); setBusy(false); }
      }
    })();
    return () => controller.abort();
  }, [apiKey]);

  function active() { check(!lifetime.current.signal.aborted, 'Screen has been removed'); }
  const host: LifecycleHost = {
    current() { active(); check(map.current, 'Map is not mounted'); return map.current; },
    async replace() {
      active();
      const previous = map.current;
      setMapKey(key => key + 1); setVisible(true);
      return waitFor(() => {
        const value = map.current;
        return value && value !== previous && configured.current.has(value) ? value : undefined;
      }, lifetime.current.signal, 'map replacement');
    },
    async unmount() {
      active(); setVisible(false);
      await waitFor(() => map.current === null ? true : undefined, lifetime.current.signal, 'map removal');
    },
    async second() {
      active(); setShowSecond(true);
      return waitFor(() => {
        const value = second.current;
        return value && configured.current.has(value) ? value : undefined;
      }, lifetime.current.signal, 'second map');
    },
    async closeSecond() {
      active(); setShowSecond(false);
      await waitFor(() => second.current === null ? true : undefined, lifetime.current.signal, 'second map removal');
    },
  };

  async function runChecks() {
    if (running.current || !map.current) return;
    running.current = true; setBusy(true);
    const signal = lifetime.current.signal;
    const startedUtc = new Date().toISOString();
    const tests: CheckResult[] = [];
    let failure: string | undefined;
    try {
      await runLifecycleChecks(host, signal, name => { if (!signal.aborted) setStatus(name); }, result => tests.push(result));
    } catch (error) { failure = String(error); }
    try {
      if (!signal.aborted) {
        const passed = !failure && tests.length === 8 && tests.every(test => test.passed);
        await testSupport.saveLifecycleResults(JSON.stringify({
          schema: 1, suite: 'public-sdk-lifecycle', platform: Platform.OS, osVersion: Platform.Version,
          startedUtc, completedUtc: new Date().toISOString(), passed, error: failure, tests,
        }));
        if (!signal.aborted) setStatus(passed ? `PASS: ${tests.length} public SDK lifecycle checks` : `FAIL: ${failure ?? 'Incomplete suite'}`);
      }
    } catch (error) { if (!signal.aborted) setStatus(`FAIL: cannot save results: ${String(error)}`); }
    finally { running.current = false; if (!signal.aborted) setBusy(false); }
  }

  async function prepare(view: GLMapViewRef, primary: boolean) {
    if (configuring.current.has(view)) return;
    configuring.current.add(view);
    const signal = lifetime.current.signal;
    try {
      await bounded((async () => {
        await view.moveCamera({ center: fixture.camera, zoom: fixture.camera.zoom, angle: 0, pitch: 0 }, null);
        await view.addVectorLayer({
          source: { line: fixture.track.features[0].geometry.coordinates.flat() },
          style: 'line{width:4pt;color:#E74C3C;}', drawOrder: 1,
        });
        await view.addImage({ ...fixture.marker, image: { svg: 'pin.svg', scale: 1 }, anchor: 'bottom', drawOrder: 2 });
      })(), signal, 'map setup');
      if (signal.aborted || (primary ? map.current : second.current) !== view) return;
      configured.current.add(view);
      if (primary && !started.current) { started.current = true; void runChecks(); }
    } catch (error) {
      if (!signal.aborted && errorCode(error) !== 'disposed') { setStatus(`FAIL: ${String(error)}`); setBusy(false); }
    }
  }

  async function action(body: () => Promise<unknown>) {
    if (running.current) return;
    setBusy(true);
    const signal = lifetime.current.signal;
    try { await bounded(body(), signal, 'screen action'); }
    catch (error) { if (!signal.aborted) setStatus(`FAIL: ${String(error)}`); }
    finally { if (!signal.aborted) setBusy(false); }
  }

  async function navigate() {
    if (visible) { savedCamera.current = await host.current().captureState(); await host.unmount(); }
    else { const view = await host.replace(); if (savedCamera.current) await restoreCamera(view, savedCamera.current); }
  }

  return <SafeAreaProvider><SafeAreaView style={styles.root}>
    <View style={styles.header}>
      <Text testID="lifecycle-status" accessibilityLabel={status} style={styles.status}>{status}</Text>
      {onBack && <Button title="Demos" onPress={onBack} />}
    </View>
    <View style={styles.maps}>
      {initialized && visible ? <GLMapView key={mapKey} ref={map} style={styles.map}
        testID="lifecycle-map" accessibilityLabel="GLMap canvas"
        onMapReady={() => { if (map.current) void prepare(map.current, true); }}
        onMapTap={() => setTaps(value => value + 1)} />
        : <View style={styles.map}><Text>{initialized ? 'Map removed' : 'Initializing…'}</Text></View>}
      {initialized && showSecond && <GLMapView ref={second} style={styles.map} testID="second-map"
        onMapReady={() => { if (second.current) void prepare(second.current, false); }} />}
      {initialized && visible && overlay && <View style={styles.overlay}>
        <Text>React Native · Expo · GLMap · taps {taps}</Text>
        <TextInput accessibilityLabel="Overlay field" style={styles.input} value={text} onChangeText={setText}
          placeholder="Type over the map" returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
        <View style={styles.buttons}>
          <Button title="Vienna" disabled={busy} onPress={() => void action(() => host.current().moveCamera({ center: { latitude: 48.2082, longitude: 16.3738 }, zoom: 6 }, null))} />
          <Button title="Reset" disabled={busy} onPress={() => void action(() => host.current().moveCamera({ center: fixture.camera, zoom: fixture.camera.zoom, angle: 0, pitch: 0 }, null))} />
          <Button title="State" disabled={busy} onPress={() => void action(async () => {
            const state = await host.current().captureState(); active(); setStatus(JSON.stringify(state));
          })} />
        </View>
      </View>}
    </View>
    <View style={styles.buttons}>
      <Button title={visible ? 'Leave map' : 'Return'} disabled={busy || !initialized} onPress={() => void action(navigate)} />
      <Button title="Overlay" disabled={busy} onPress={() => { Keyboard.dismiss(); setOverlay(value => !value); }} />
      <Button title="Run tests" disabled={busy || !visible || !initialized} onPress={() => void runChecks()} />
    </View>
  </SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3f5f8' },
  header: { flexDirection: 'row', alignItems: 'center' },
  status: { flex: 1, fontSize: 13, padding: 12, minHeight: 46 },
  maps: { flex: 1, flexDirection: 'row', overflow: 'hidden' },
  map: { flex: 1 },
  overlay: { position: 'absolute', top: 12, left: 12, right: 12, padding: 12, borderRadius: 12, backgroundColor: '#fffffff0' },
  input: { height: 40, borderWidth: 1, borderColor: '#b7c0cc', borderRadius: 7, paddingHorizontal: 8, marginTop: 8 },
  buttons: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6 },
});
