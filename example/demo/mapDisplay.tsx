import React, { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { Bounds, GLMapSdk } from "@globus-software/glmap-core";
import { GLMapViewRef, MapTouch } from "@globus-software/glmap";
import {
  Action,
  Controls,
  DemoMap,
  DemoProps,
  Screen,
  Status,
  styles,
  useTasks,
} from "./common";

const osm = {
  urlTemplates: ["a", "b", "c"].map(
    (mirror) => `https://${mirror}.tile.openstreetmap.org/{z}/{x}/{y}.png`,
  ),
  attribution: "© OpenStreetMap contributors",
  cacheName: "osm_tiles.db",
};

export function OnlineMapDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const balloon = useRef<number | null>(null);
  const [raster, setRaster] = useState(false);
  const { status, run } = useTasks();

  const ready = async (view: GLMapViewRef) => {
    // Cortina d'Ampezzo shows hillshades and contour lines well.
    await view.moveCamera(
      { center: { latitude: 46.5369, longitude: 12.1356 }, zoom: 13 },
      null,
    );
    await view.setOptions({ elevationLines: true, hillshades: true });
    await view.setStyleOptions({ Style: "Outdoor", SubStyle: "Ski" });
  };
  const toggleSource = () =>
    run(async () => {
      const next = !raster;
      await map.current?.setTileSource(next ? osm : null);
      await map.current?.setOptions({ elevationLines: !next, hillshades: !next });
      setRaster(next);
    });
  const showCoordinates = (touch: MapTouch) =>
    run(async () => {
      const view = map.current;
      if (!view) return;
      const content = {
        latitude: touch.latitude,
        longitude: touch.longitude,
        text: `${touch.latitude.toFixed(4)}, ${touch.longitude.toFixed(4)}`,
        textStyle: "{text-color:#2C3E50;font-size:14;font-stroke-width:0;}",
      };
      if (balloon.current === null)
        balloon.current = await view.addBalloon({ ...content, drawOrder: 10 });
      else await view.updateBalloon(balloon.current, content);
    });

  return (
    <Screen title="Online Map" onBack={onBack}>
      <DemoMap
        mapRef={map}
        run={run}
        onReady={ready}
        onMapTap={(event) => showCoordinates(event.nativeEvent)}
      />
      <Status text={status} />
      <Controls>
        <Action
          title={raster ? "GLMap Vector" : "OSM Raster"}
          onPress={toggleSource}
        />
      </Controls>
    </Screen>
  );
}

export function DarkThemeDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const [dark, setDark] = useState(true);
  const { status, run } = useTasks();

  const ready = async (view: GLMapViewRef) => {
    // Venice
    await view.moveCamera(
      { center: { latitude: 45.4371, longitude: 12.3326 }, zoom: 14 },
      null,
    );
    await view.setStyleOptions({ Theme: "Dark" });
  };
  const toggleTheme = () =>
    run(async () => {
      await map.current?.setStyleOptions(dark ? {} : { Theme: "Dark" });
      setDark(!dark);
    });

  return (
    <Screen title="Dark Theme" onBack={onBack}>
      <DemoMap mapRef={map} run={run} onReady={ready} />
      <Status text={status} />
      <Controls>
        <Action title={dark ? "Light" : "Dark"} onPress={toggleTheme} />
      </Controls>
    </Screen>
  );
}

// Chamonix area of the Alps
const terrainBounds: Bounds = { south: 45.85, west: 6.75, north: 46.05, east: 7.05 };

export function TerrainDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const download = useRef(new AbortController());
  const [altitudeScale, setAltitudeScale] = useState(1);
  const [layers, setLayers] = useState({
    hillshades: true,
    elevationLines: true,
    slopes: false,
  });
  const { status, setStatus, run } = useTasks();
  useEffect(() => () => download.current.abort(), []);

  const ready = async (view: GLMapViewRef) => {
    await view.setOptions({
      visibleInsets: { top: 0, left: 0, bottom: 0, right: 0 },
      altitudeScale,
      ...layers,
    });
    await view.moveCamera({ bounds: terrainBounds, zoomDelta: 1, pitch: 45 }, null);
    setStatus("Downloading map and elevation data…");
    await GLMapSdk.downloadArea(
      terrainBounds,
      [
        { dataSet: "map", fileName: "terrain_map.vmtar" },
        { dataSet: "elevation", fileName: "terrain_ele.eletar" },
      ],
      { signal: download.current.signal },
    );
    await view.reloadTiles();
    setStatus("");
  };
  const changeAltitude = (delta: number) =>
    run(async () => {
      const next = Math.min(3, Math.max(0, altitudeScale + delta));
      await map.current?.setOptions({ altitudeScale: next });
      setAltitudeScale(next);
    });
  const toggle = (layer: keyof typeof layers) =>
    run(async () => {
      const next = { ...layers, [layer]: !layers[layer] };
      await map.current?.setOptions(next);
      setLayers(next);
    });

  return (
    <Screen title="3D Terrain" onBack={onBack}>
      <DemoMap mapRef={map} run={run} onReady={ready} />
      <Status text={status} />
      <Controls>
        <Action title="−" onPress={() => changeAltitude(-0.5)} />
        <Text style={styles.status}>
          Altitude Scale: {altitudeScale.toFixed(1)}
        </Text>
        <Action title="+" onPress={() => changeAltitude(0.5)} />
      </Controls>
      <Controls>
        <Action
          title="Hillshades"
          selected={layers.hillshades}
          onPress={() => toggle("hillshades")}
        />
        <Action
          title="Elevation Lines"
          selected={layers.elevationLines}
          onPress={() => toggle("elevationLines")}
        />
        <Action
          title="Slopes"
          selected={layers.slopes}
          onPress={() => toggle("slopes")}
        />
      </Controls>
    </Screen>
  );
}
