import React, { useRef } from "react";
import { ScrollView, Text } from "react-native";
import { GLMapTrack, GLMapViewRef, MapTouch } from "@globus-software/glmap";
import { Location } from "@globus-software/glmap-core";
import { Action, Controls, DemoMap, DemoProps, Screen, Status, styles, useTasks } from "./common";
import { useLocationFeed } from "./location";

/** A closed ring of `count` points around the center; radii alternate for a star. */
function ring(latitude: number, longitude: number, count: number, radii: number[], start: number) {
  const points: number[] = [];
  for (let i = 0; i <= count; i++) {
    const angle = (i * 2 * Math.PI) / count + start;
    const radius = radii[i % radii.length];
    points.push(
      // Compensate the longitude for latitude.
      longitude + (radius * Math.cos(angle)) / Math.cos((latitude * Math.PI) / 180),
      latitude + radius * Math.sin(angle),
    );
  }
  return points;
}

export function LinesPolygonsDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const { status, run } = useTasks();

  const ready = async (view: GLMapViewRef) => {
    await view.moveCamera({ center: { latitude: 48.8566, longitude: 2.3522 }, zoom: 5 }, null);
    const layers = [
      // London → Paris → Geneva → Rome
      {
        source: { line: [-0.1275, 51.5072, 2.3522, 48.8566, 6.1432, 46.2044, 12.4829, 41.8933] },
        style: "line{width:4pt;color:#E74C3C;}",
        drawOrder: 3,
      },
      // Berlin → Prague → Vienna → Budapest
      {
        source: { line: [13.4102, 52.5037, 14.4378, 50.0755, 16.3738, 48.2082, 19.0402, 47.4979] },
        style: "line{width:4pt;color:#3498DB;}",
        drawOrder: 3,
      },
      // Amsterdam → Brussels → Luxembourg → Paris
      {
        source: { line: [4.9021, 52.369, 4.3458, 50.8263, 6.1296, 49.6072, 2.3522, 48.8566] },
        style: "line{width:3pt;color:#2ECC71;linecap:round;}",
        drawOrder: 3,
      },
      // A five-pointed star around Paris
      {
        source: { polygon: [ring(48.8566, 2.3522, 10, [3, 1.2], -Math.PI / 2)] },
        style: "area{fill-color:#F39C1230;width:2pt;color:#F39C12;}",
        drawOrder: 2,
      },
      // A hexagon with a hole around Berlin
      {
        source: {
          polygon: [ring(52.5037, 13.4102, 6, [1.5], 0), ring(52.5037, 13.4102, 6, [0.6], 0)],
        },
        style: "area{fill-color:#9B59B630;width:2pt;color:#9B59B6;}",
        drawOrder: 2,
      },
    ];
    for (const layer of layers) await view.addVectorLayer(layer);
  };

  return (
    <Screen title="Lines & Polygons" onBack={onBack}>
      <DemoMap mapRef={map} run={run} onReady={ready} />
      <Status text={status} />
    </Screen>
  );
}

export function GeoJSONDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const layer = useRef<number | null>(null);
  const { status, setStatus, run } = useTasks("Loading uk_postcodes.geojson…");

  const ready = async (view: GLMapViewRef) => {
    const added = await view.addVectorLayer({
      source: { asset: "uk_postcodes.geojson" },
      style: "area{fill-color:#3498DB40; width:1.5pt; color:#2C3E50;}",
      drawOrder: 1,
    });
    layer.current = added.id;
    if (added.bounds) await view.moveCamera({ bounds: added.bounds }, null);
    setStatus("");
  };
  const identify = (touch: MapTouch) =>
    run(async () => {
      if (layer.current === null) return;
      const found = await map.current?.pickVectorObject(layer.current, touch.x, touch.y, 10);
      if (found) setStatus(`Tapped: ${JSON.stringify(JSON.parse(found).properties ?? {})}`);
    });

  return (
    <Screen title="Tap on any UK region" onBack={onBack}>
      <DemoMap
        mapRef={map}
        run={run}
        onReady={ready}
        onMapTap={(event) => identify(event.nativeEvent)}
      />
      <ScrollView style={{ maxHeight: 96 }}>
        <Text style={styles.status}>{status}</Text>
      </ScrollView>
    </Screen>
  );
}

// Along La Concha bay in San Sebastián.
const bayWalk = [
  { latitude: 43.3183, longitude: -1.9812 },
  { latitude: 43.3176, longitude: -1.9832 },
  { latitude: 43.3167, longitude: -1.9851 },
  { latitude: 43.3157, longitude: -1.9868 },
  { latitude: 43.315, longitude: -1.9889 },
  { latitude: 43.3146, longitude: -1.9912 },
];

export function GPSTrackDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const track = useRef<GLMapTrack | null>(null);
  const marker = useRef<number | null>(null);
  const points = useRef(0);
  const { status, setStatus, run } = useTasks("Waiting for location…");

  const feed = useLocationFeed(async (fix: Location) => {
    const view = map.current;
    if (!view || track.current === null || marker.current === null) return;
    const center = { latitude: fix.latitude, longitude: fix.longitude };
    const first = points.current === 0;
    await track.current.appendPoint(center, "#FFFF00");
    await view.updateUserLocation(marker.current, fix, !first);
    // Rotate the map to the direction of movement.
    const camera =
      fix.bearing === null ? { center } : { center, angle: -fix.bearing };
    await view.moveCamera(
      first ? { ...camera, zoom: 15 } : camera,
      first ? null : { duration: 1, linear: true },
    );
    setStatus(`${++points.current} track points`);
  }, run);

  const ready = async (view: GLMapViewRef) => {
    await view.moveCamera({ center: bayWalk[0], zoom: 15 }, null);
    track.current = await view.addTrack({ style: "{width:5pt;}", drawOrder: 2 });
    marker.current = await view.addUserLocation(100);
    await feed.start();
  };

  return (
    <Screen title="GPS Track" onBack={onBack}>
      <DemoMap mapRef={map} run={run} onReady={ready} />
      <Status text={status} />
      <Controls>
        <Action title="Replay sample position" onPress={() => feed.replay(bayWalk)} />
      </Controls>
    </Screen>
  );
}
