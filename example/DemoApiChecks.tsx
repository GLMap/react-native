import { GLSearch } from "@globus-software/glsearch";
import { GLRouteSDK } from "@globus-software/glroute";
import React, { useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { errorCode, GLMapSdk } from "@globus-software/glmap-core";
import { GLMapView, GLMapViewRef } from "@globus-software/glmap";
import { lab } from "./modules/glmap-test-support/src";

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function rejects(body: () => Promise<unknown>, code: string) {
  try { await body(); } catch (error) { check(errorCode(error) === code, String(error)); return; }
  throw new Error(`Expected ${code}`);
}

/** On-device checks of the public demo API; build with EXPO_PUBLIC_GLMAP_API_TESTS=1. */
export default function DemoApiChecks() {
  const map = useRef<GLMapViewRef>(null);
  const started = useRef(false);
  const [visible, setVisible] = useState(true);
  const [status, setStatus] = useState("Running demo API checks…");
  const run = async () => {
    if (started.current || !map.current) return;
    started.current = true;
    const view = map.current;
    const tests: { name: string; passed: boolean; error?: string }[] = [];
    const test = async (name: string, body: () => Promise<void>) => {
      try { await body(); tests.push({ name, passed: true }); }
      catch (error) { tests.push({ name, passed: false, error: String(error) }); throw error; }
    };
    const center = { latitude: 42.4341, longitude: 19.26 };
    try {
      await GLMapSdk.initialize("");
      await GLMapSdk.setTileDownloadingAllowed(false);
      await test("Degrees and partial camera update preserve other fields", async () => {
        await view.moveCamera({ center, zoom: 14, angle: 90, pitch: 20 }, null);
        const before = await view.captureState();
        check(Math.abs(before.angle - 90) < 0.001, "Rotation is not in degrees");
        await view.moveCamera({ angle: -90 }, null);
        const after = await view.captureState();
        check(Math.abs((after.angle % 360 + 360) % 360 - 270) < 0.001, "Negative rotation");
        check(Math.abs(after.zoom - before.zoom) < 0.001 && Math.abs(after.pitch - before.pitch) < 0.001, "Partial update changed zoom/pitch");
        await rejects(() => view.moveCamera({ angle: 1e300 }, null), "invalid_argument");
        await rejects(() => view.moveCamera({ pitch: 100 }, null), "invalid_argument");
        await view.moveCamera({ angle: 0, pitch: 0 }, null);
      });
      const input = new Float64Array([NaN, 19.25, 42.43, 19.27, 42.44, NaN]);
      const line = input.subarray(1, 5);
      await test("Packed projection, subview bounds and convenience arrays", async () => {
        const a = await view.project(line), b = await view.project(Array.from(line));
        await rejects(() => view.project(new Float64Array([19, 91])), "invalid_argument");
        check(a.length === 4 && a.every((v, i) => Number.isFinite(v) && Math.abs(v - b[i]) < 0.001), "Projection/subview mismatch");
      });
      await test("Packed lines, polygon rings, markers and group pins", async () => {
        const layer = await view.addVectorLayer({ source: { line }, style: "line{width:4pt;color:red;}", drawOrder: 2 });
        const point = await view.project(line.subarray(0, 2));
        line.fill(0); // Native geometry owns its input after submission.
        const json = await view.pickVectorObject(layer.id, point[0], point[1], 24);
        check(json, "Native line picking failed");
        const object = JSON.parse(json);
        const coordinates = (object.geometry?.coordinates ?? object.coordinates).flat(Infinity) as number[];
        check(coordinates.some((value, i) => i % 2 === 0 && Math.abs(value - 19.25) < 0.000002 && Math.abs(coordinates[i + 1] - 42.43) < 0.000002), "Native line retained JS storage");
        const polygon = await view.addVectorLayer({ source: { polygon: [new Float64Array([19.25,42.43,19.27,42.43,19.27,42.44,19.25,42.43]), new Float64Array([19.26,42.433,19.265,42.433,19.265,42.436,19.26,42.433])] }, style: "area{fill-color:red;}", drawOrder: 1 });
        const image = { svg: "pin.svg", scale: 1 };
        const markers = await view.addMarkerLayer({ markers: { points: new Float64Array([19.26,42.4341]) }, images: [image], clustered: false, drawOrder: 3 });
        check(markers.count === 1, "Marker buffer conversion");
        const group = await view.addImageGroup({ images: [image], drawOrder: 4 });
        await view.setImageGroupPins(group, new Float64Array([19.26,42.4341,0]));
        await rejects(() => view.addVectorLayer({ source: { line: new Float64Array([1,2,3]) }, style: "line{width:4pt;color:red;}", drawOrder: 2 }), "invalid_argument");
        for (const id of [layer.id, polygon.id, markers.id, group]) await view.removeDrawable(id);
      });
      await test("Image/track handles, packed route steps and removed handles", async () => {
        const image = await view.addImage({ ...center, image: { svg: "pin.svg", scale: 1 }, anchor: "bottom", drawOrder: 3 });
        await image.update({ scale: 1.2 });
        const route = await GLRouteSDK.buildRoute([{ coordinates: new Float64Array([19.25,42.43,19.26,42.4341]), instruction: "Continue", turn: "continue", duration: 30 }, { coordinates: [19.26,42.4341,19.27,42.44], instruction: "Turn", turn: "right", duration: 20 }]);
        check(route.distance > 100, "Packed route input");
        const track = await view.addTrack({ style: "{width:5pt;color:red;}", drawOrder: 2 });
        await track.setRoute(route, "#FF0000");
        await track.setProgress(0.5);
        await track.appendPoint(center, "#FF0000");
        await track.remove(); await track.remove();
        await rejects(() => track.setProgress(1), "not_found");
        await image.remove();
        await rejects(() => image.update({ scale: 2 }), "not_found");
        await route.release();
      });
      await test("Independent Search queries and Map query capability", async () => {
        await GLMapSdk.addDataSet("Montenegro.vm", "map");
        const found = await GLSearch.search({text:"Podgorica",type:"search",offline:true,center,limit:30});
        check(found.length > 0, "Offline Search returned no data");
        const point = await view.project(new Float64Array([center.longitude,center.latitude]));
        const picked = await GLSearch.pickMapObject(view,point[0],point[1],24);
        check(picked === null || typeof picked.name === "string", "Search did not consume Map's Core state");
      });
      await test("Unmount invalidates retained handles", async () => {
        const image = await view.addImage({ ...center, image: { svg: "pin.svg", scale: 1 }, anchor: "bottom", drawOrder: 3 });
        setVisible(false);
        for (let i = 0; i < 100 && map.current; i++) await new Promise((resolve) => setTimeout(resolve, 20));
        check(map.current === null, "Map did not unmount");
        await rejects(() => image.update({ scale: 2 }), "disposed");
        await rejects(() => view.captureState(), "disposed");
        await rejects(() => GLSearch.pickMapObject(view,0,0,24), "disposed");
      });
      setStatus(`PASS: ${tests.length} demo API checks`);
    } catch (error) { setStatus(`FAIL: ${String(error)}`); }
    await lab.saveResults(JSON.stringify({ experiment: "demo-api-polish", platform: Platform.OS, date: new Date().toISOString(), passed: tests.length === 6 && tests.every((t) => t.passed), tests }));
  };
  return <View style={{ flex: 1, paddingTop: 60 }}><Text>{status}</Text>{visible && <GLMapView ref={map} style={{ flex: 1 }} onMapReady={() => void run()} />}</View>;
}
