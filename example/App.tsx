import React, { useRef, useState } from "react";
import {
  AppState,
  Button,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { GLMap, GLMapRef, lab, MapState } from "./modules/glmap-test-support";
import fixture from "./assets/stage-a.json";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const initial = JSON.stringify(fixture);
const green = "line{width:4pt;color:#00AA44;}";
const blue = "line{width:7pt;color:#2650D6;}";
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}
function close(a: number, b: number, tolerance = 0.001) {
  assert(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
}
async function rejects(task: Promise<unknown>) {
  try {
    await task;
  } catch {
    return;
  }
  throw new Error("Expected rejection");
}
async function bounded<T>(task: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), 25000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
function coordinates(json: string) {
  const document = JSON.parse(json),
    g = document.type === "Feature" ? document.geometry : document;
  return g.type === "MultiLineString" ? g.coordinates[0] : g.coordinates;
}

export default function App() {
  const map = useRef<GLMapRef>(null),
    second = useRef<GLMapRef>(null);
  const [key, setKey] = useState(0),
    [showMap, setShowMap] = useState(true),
    [showSecond, setShowSecond] = useState(false);
  const [status, setStatus] = useState("Preparing native map"),
    [overlay, setOverlay] = useState(true);
  const [text, setText] = useState(""),
    [taps, setTaps] = useState(0);
  const started = useRef(false),
    running = useRef(false);
  const waiting = useRef<((view: GLMapRef) => void) | null>(null);
  const waitingSecond = useRef<((view: GLMapRef) => void) | null>(null);
  const savedCamera = useRef<MapState | null>(null);
  function recreate() {
    return bounded(
      new Promise<GLMapRef>((resolve) => {
        waiting.current = resolve;
        setKey((v) => v + 1);
        setShowMap(true);
      }),
      "recreation",
    );
  }
  async function capture(view: GLMapRef) {
    return bounded(view.captureState(), "capture");
  }
  async function suite(view: GLMapRef) {
    if (running.current) return;
    running.current = true;
    const startedUtc = new Date().toISOString();
    const rows: { name: string; milliseconds: number; detail: unknown }[] = [];
    async function test(name: string, action: () => Promise<unknown>) {
      setStatus(name);
      const start = performance.now();
      const detail = await bounded(action(), name);
      rows.push({ name, milliseconds: performance.now() - start, detail });
    }
    try {
      if (AppState.currentState !== "active") {
        let subscription: ReturnType<typeof AppState.addEventListener>;
        try {
          await bounded(
            new Promise<void>((resolve) => {
              subscription = AppState.addEventListener("change", (state) => {
                if (state === "active") resolve();
              });
            }),
            "application foreground",
          );
        } finally {
          subscription!.remove();
        }
      }
      await sleep(700);
      await test("Fixture and camera snapshot", async () => {
        const s = await capture(view);
        close(s.latitude, 49, 0.05);
        close(s.longitude, 16, 0.05);
        close(s.zoom, 5);
        const d = await view.diagnostics();
        assert(
          d.width > 0 && d.height > 0 && d.surfaceAvailable,
          "Map not attached",
        );
        return { state: s, diagnostics: d };
      });
      await test("Camera and 20 concurrent captures", async () => {
        await view.setCamera({
          latitude: 48.2082,
          longitude: 16.3738,
          zoom: 12,
          angle: 24,
          pitch: 20,
        });
        const all = await Promise.all(
          Array.from({ length: 20 }, () => capture(view)),
        );
        all.forEach((s) => {
          close(s.latitude, 48.2082);
          close(s.longitude, 16.3738);
          close(s.zoom, 12);
          close(s.angle, 24);
          close(s.pitch, 20);
        });
        await rejects(view.setCamera({ latitude: 100, longitude: 0, zoom: 5 }));
        await view.setCamera(fixture.camera);
        return all[0];
      });
      await test("Packed / GeoJSON / restyle / invalid input / clear", async () => {
        const id = await view.createVectorLayer(3),
          data = [70, -20, 74, -10];
        console.info("vector: first packed");
        const submitted = view.mutateVectorLayer(
          id,
          "replace",
          data,
          null,
          green,
        );
        data.fill(0);
        assert((await submitted) === "ready", "Packed not Ready");
        console.info("vector: packed ready; readback/restyle");
        const line = coordinates((await view.diagnostics()).layers[0].geoJson!);
        close(line[0][0], 70);
        close(line[0][1], -20);
        assert(
          (await view.mutateVectorLayer(id, "style", null, null, blue)) ===
            "ready",
          "Restyle not Ready",
        );
        console.info("vector: restyle ready; invalid input");
        const before = (await view.diagnostics()).layers[0].geoJson;
        await rejects(
          view.mutateVectorLayer(id, "replace", [10, 40, 999, 41], null, green),
        );
        await rejects(
          view.mutateVectorLayer(id, "replace", [1, 2, 3], null, green),
        );
        await rejects(
          view.mutateVectorLayer(id, "replace", null, "{bad", green),
        );
        await rejects(
          view.mutateVectorLayer(id, "style", null, null, "line { width: }"),
        );
        assert(
          (await view.diagnostics()).layers[0].geoJson === before,
          "Invalid input changed geometry",
        );
        console.info("vector: invalid inputs rejected; geojson");
        const geo = JSON.stringify({
          type: "LineString",
          coordinates: [
            [14, 50],
            [16, 48],
          ],
        });
        assert(
          (await view.mutateVectorLayer(id, "replace", null, geo, green)) ===
            "ready",
          "GeoJSON not Ready",
        );
        console.info("vector: geojson ready; 10k");
        const large = Array.from({ length: 20000 }, (_, i) =>
          i % 2 ? 48 + (i % 4) * 0.001 : 16 + i * 0.00005,
        );
        assert(
          (await view.mutateVectorLayer(id, "replace", large, null, blue)) ===
            "ready",
          "Large line not Ready",
        );
        assert(
          coordinates((await view.diagnostics()).layers[0].geoJson!).length ===
            10000,
          "Wrong line size",
        );
        await view.mutateVectorLayer(id, "replace", [], null, green);
        assert(
          (await view.diagnostics()).layers[0].count === 0,
          "Empty input did not clear",
        );
        await view.mutateVectorLayer(id, "remove", null, null, null);
        await rejects(view.mutateVectorLayer(id, "style", null, null, green));
        return { points: 10000, inputCopied: true };
      });
      await test("Two maps and 60 overlapping updates", async () => {
        const other = await new Promise<GLMapRef>((resolve) => {
          waitingSecond.current = resolve;
          setShowSecond(true);
        });
        const a = await view.createVectorLayer(3),
          b = await other.createVectorLayer(3);
        await other.mutateVectorLayer(
          b,
          "replace",
          [130, 40, 131, 41],
          null,
          blue,
        );
        const outcomes = await Promise.all(
          Array.from({ length: 60 }, (_, i) =>
            view.mutateVectorLayer(
              a,
              "replace",
              [10 + i * 0.01, 40, 11 + i * 0.01, 41],
              null,
              green,
            ),
          ),
        );
        assert(
          outcomes.at(-1) === "ready" &&
            outcomes.every((x) => x === "ready" || x === "superseded"),
          "Invalid update outcome",
        );
        close(
          coordinates(
            (await view.diagnostics()).layers.find((x) => x.id === a)!.geoJson!,
          )[0][0],
          10.59,
        );
        close(
          coordinates((await other.diagnostics()).layers[0].geoJson!)[0][0],
          130,
        );
        const pending = view.mutateVectorLayer(
          a,
          "replace",
          [10, 40, 11, 41],
          null,
          green,
        );
        const removal = view.mutateVectorLayer(a, "remove", null, null, null);
        const outcome = await pending;
        await removal;
        assert(
          outcome === "cancelled" || outcome === "ready",
          "Invalid removal",
        );
        setShowSecond(false);
        return {
          ready: outcomes.filter((x) => x === "ready").length,
          superseded: outcomes.filter((x) => x === "superseded").length,
          removal: outcome,
        };
      });
      await test("Navigate away and restore captured camera", async () => {
        await view.setCamera({
          latitude: 48.2082,
          longitude: 16.3738,
          zoom: 12,
        });
        const saved = await capture(view);
        setShowMap(false);
        await sleep(200);
        view = await recreate();
        await view.setCamera(saved);
        const actual = await capture(view);
        close(actual.latitude, saved.latitude);
        close(actual.longitude, saved.longitude);
        close(actual.zoom, saved.zoom);
        return actual;
      });
      await test("Ten unmount / recreation cycles", async () => {
        for (let i = 0; i < 10; i++) {
          console.info(`recreation ${i}: begin`);
          const previous = view;
          view = await recreate();
          console.info(`recreation ${i}: attached`);
          const s = await capture(view);
          close(s.latitude, 49, 0.05);
          close(s.longitude, 16, 0.05);
          close(s.zoom, 5);
          await rejects(previous.captureState());
          console.info(`recreation ${i}: checked`);
        }
        return { cycles: 10 };
      });
      await test("Dispose settles pending updates", async () => {
        const id = await view.createVectorLayer(3);
        const pending = view
          .mutateVectorLayer(id, "replace", [10, 40, 11, 41], null, green)
          .then(
            (result) => ({ result }),
            (error) => ({ error: String(error) }),
          );
        await view.dispose();
        await pending;
        await rejects(view.captureState());
        view = await recreate();
        return await capture(view);
      });
      const report = {
        schema: 1,
        experiment: "react-native-stage-a-api",
        platform: Platform.OS,
        osVersion: Platform.Version,
        startedUtc,
        completedUtc: new Date().toISOString(),
        passed: true,
        fabric: !!(globalThis as any).nativeFabricUIManager,
        hermes: !!(globalThis as any).HermesInternal,
        tests: rows,
        finalState: await capture(view),
        nativeGestures: "not exercised by JS self-test",
      };
      await lab.saveResults(JSON.stringify(report, null, 2));
      setStatus(
        `PASS: ${rows.length} scenarios · ${Platform.OS} · Fabric ${report.fabric}`,
      );
    } catch (error) {
      setStatus("FAIL: " + String(error));
      await lab.saveResults(
        JSON.stringify(
          {
            passed: false,
            platform: Platform.OS,
            startedUtc,
            error: error instanceof Error ? error.stack : String(error),
            tests: rows,
          },
          null,
          2,
        ),
      );
    } finally {
      running.current = false;
    }
  }
  function ready() {
    if (!map.current) return;
    if (waiting.current) {
      const resolve = waiting.current;
      waiting.current = null;
      resolve(map.current);
    } else if (!started.current) {
      started.current = true;
      void suite(map.current);
    }
  }
  async function navigate() {
    if (showMap) {
      savedCamera.current = await map.current!.captureState();
      setShowMap(false);
    } else {
      const view = await recreate();
      if (savedCamera.current) await view.setCamera(savedCamera.current);
    }
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <Text testID="lab-status" accessibilityLabel={status} style={styles.status}>
          {status}
        </Text>
        <View style={styles.maps}>
          {showMap ? (
            <GLMap
              key={key}
              ref={map}
              fixture={initial}
              style={styles.map}
              onReady={ready}
              onMapTap={(e) => setTaps(e.nativeEvent.count)}
              onFailure={(e) =>
                setStatus("NATIVE ERROR: " + e.nativeEvent.message)
              }
            />
          ) : (
            <View style={styles.map}>
              <Text>Map removed</Text>
            </View>
          )}
          {showSecond && (
            <GLMap
              ref={second}
              fixture={initial}
              style={styles.map}
              onReady={() => {
                if (second.current) {
                  waitingSecond.current?.(second.current);
                  waitingSecond.current = null;
                }
              }}
            />
          )}
          {overlay && (
            <View style={styles.overlay}>
              <Text>React Native · Expo · GLMap · taps {taps}</Text>
              <TextInput
                accessibilityLabel="Overlay field"
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="Type over the map"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              <View style={styles.buttons}>
                <Button
                  title="Vienna"
                  onPress={() =>
                    void map.current?.setCamera({
                      latitude: 48.2082,
                      longitude: 16.3738,
                      zoom: 6,
                    })
                  }
                />
                <Button
                  title="Reset"
                  onPress={() => void map.current?.setCamera(fixture.camera)}
                />
                <Button
                  title="State"
                  onPress={() =>
                    void map.current
                      ?.captureState()
                      .then((s) => setStatus(JSON.stringify(s)))
                  }
                />
              </View>
            </View>
          )}
        </View>
        <View style={styles.buttons}>
          <Button
            title={showMap ? "Leave map" : "Return"}
            onPress={() => void navigate()}
          />
          <Button
            title="Overlay"
            onPress={() => {
              Keyboard.dismiss();
              setOverlay((v) => !v);
            }}
          />
          <Button
            title="Run tests"
            onPress={() => {
              if (map.current) void suite(map.current);
            }}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f5f8" },
  status: { fontSize: 13, padding: 12, minHeight: 46 },
  maps: { flex: 1, flexDirection: "row", overflow: "hidden" },
  map: { flex: 1 },
  overlay: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fffffff0",
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: "#b7c0cc",
    borderRadius: 7,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 6,
  },
});
