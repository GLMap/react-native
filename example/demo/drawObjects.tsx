import { GLRouteSDK } from "@globus-software/glroute";
import React, { useEffect, useRef, useState } from "react";
import { GeoPoint, GLMapSdk, Location } from "@globus-software/glmap-core";
import { GLMapViewRef, GLMapImage, GLMapTrack, MapTouch } from "@globus-software/glmap";
import { GLRoute } from "@globus-software/glroute";
import { Action, Controls, DemoMap, DemoProps, Screen, Status, useTasks } from "./common";
import { useLocationFeed } from "./location";

const paris = { latitude: 48.8566, longitude: 2.3522 };
const redPin = { svg: "pin.svg", scale: 1.6, tint: "#E63C3C" };

export function ImageDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const image = useRef<GLMapImage | null>(null);
  const { status, run } = useTasks();

  const ready = async (view: GLMapViewRef) => {
    await view.moveCamera({ center: paris, zoom: 7 }, null);
    image.current = await view.addImage({
      ...paris,
      image: redPin,
      anchor: "bottom",
      drawOrder: 3,
    });
  };
  const move = ({ latitude, longitude }: MapTouch) =>
    run(async () => {
      if (image.current !== null)
        await image.current.update({ latitude, longitude }, 0.3);
    });

  return (
    <Screen title="Tap map to move the image" onBack={onBack}>
      <DemoMap
        mapRef={map}
        run={run}
        onReady={ready}
        onMapTap={(event) => move(event.nativeEvent)}
      />
      <Status text={status} />
    </Screen>
  );
}

/** Index of the first point drawn within `radius` logical pixels of the touch. */
async function hitTest(view: GLMapViewRef, points: GeoPoint[], touch: MapTouch, radius: number) {
  const screen = await view.project(points.flatMap((p) => [p.longitude, p.latitude]));
  return points.findIndex(
    (_, i) => Math.hypot(screen[2 * i] - touch.x, screen[2 * i + 1] - touch.y) < radius,
  );
}

// Eiffel Tower, Louvre, Notre-Dame, Sacré-Cœur, Arc de Triomphe, Panthéon, Musée d'Orsay, Trocadéro
const parisSights = [
  [48.8584, 2.2945],
  [48.8606, 2.3376],
  [48.853, 2.3499],
  [48.8867, 2.3431],
  [48.8738, 2.295],
  [48.8462, 2.3464],
  [48.86, 2.3266],
  [48.8619, 2.287],
];

export function ImageGroupDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const group = useRef<number | null>(null);
  const pins = useRef<(GeoPoint & { image: number })[]>([]);
  const added = useRef(0);
  const { status, setStatus, run } = useTasks();

  const show = async (view: GLMapViewRef) => {
    if (group.current === null) return;
    await view.setImageGroupPins(
      group.current,
      pins.current.flatMap((pin) => [pin.longitude, pin.latitude, pin.image]),
    );
    setStatus(`${pins.current.length} pins`);
  };
  const ready = async (view: GLMapViewRef) => {
    await view.moveCamera({ center: paris, zoom: 13 }, null);
    group.current = await view.addImageGroup({
      images: ["#E63C3C", "#3C78E6", "#28B45A"].map((tint) => ({ ...redPin, tint })),
      drawOrder: 3,
    });
    pins.current = parisSights.map(([latitude, longitude]) => ({
      latitude,
      longitude,
      image: added.current++ % 3,
    }));
    await show(view);
  };
  const add = ({ latitude, longitude }: MapTouch) =>
    run(async () => {
      if (!map.current) return;
      pins.current = [...pins.current, { latitude, longitude, image: added.current++ % 3 }];
      await show(map.current);
    });
  const remove = (touch: MapTouch) =>
    run(async () => {
      if (!map.current) return;
      const hit = await hitTest(map.current, pins.current, touch, 40);
      if (hit < 0) return;
      pins.current = pins.current.filter((_, index) => index !== hit);
      await show(map.current);
    });

  return (
    <Screen title="Long press to add, tap to remove" onBack={onBack}>
      <DemoMap
        mapRef={map}
        run={run}
        onReady={ready}
        onMapTap={(event) => remove(event.nativeEvent)}
        onMapLongPress={(event) => add(event.nativeEvent)}
      />
      <Status text={status} />
    </Screen>
  );
}

const clusterTints = [
  "#2100FF",
  "#44C3FF",
  "#3FEDC6",
  "#0FE424",
  "#A8EE19",
  "#D6EA19",
  "#DFB413",
  "#FF0000",
];

export function MarkerClusteringDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const { status, setStatus, run } = useTasks("Loading markers…");

  const ready = async (view: GLMapViewRef) => {
    const layer = await view.addMarkerLayer({
      markers: { asset: "cluster_data.json" },
      images: clusterTints.map((tint, index) => ({
        svg: "cluster.svg",
        scale: 0.2 + 0.1 * index,
        tint,
      })),
      clustered: true,
      labelKey: "name",
      drawOrder: 2,
    });
    if (layer.bounds) await view.moveCamera({ bounds: layer.bounds }, null);
    setStatus(`${layer.count} markers`);
  };

  return (
    <Screen title="Markers & Clustering" onBack={onBack}>
      <DemoMap mapRef={map} run={run} onReady={ready} />
      <Status text={status} />
    </Screen>
  );
}

const landmarks = [
  { name: "Eiffel Tower", latitude: 48.8584, longitude: 2.2945 },
  { name: "Colosseum", latitude: 41.8902, longitude: 12.4922 },
  { name: "Big Ben", latitude: 51.5007, longitude: -0.1246 },
  { name: "Brandenburg Gate", latitude: 52.5163, longitude: 13.3777 },
];

export function BalloonDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const balloon = useRef<number | null>(null);
  const { status, run } = useTasks();

  const ready = async (view: GLMapViewRef) => {
    await view.moveCamera({ center: { latitude: 48, longitude: 8 }, zoom: 5 }, null);
    for (const { latitude, longitude } of landmarks)
      await view.addImage({ latitude, longitude, image: redPin, anchor: "bottom", drawOrder: 3 });
  };
  const showBalloon = (touch: MapTouch) =>
    run(async () => {
      const view = map.current;
      if (!view) return;
      if (balloon.current !== null) await view.removeDrawable(balloon.current);
      balloon.current = null;
      const hit = await hitTest(view, landmarks, touch, 40);
      if (hit < 0) return;
      const { name, latitude, longitude } = landmarks[hit];
      balloon.current = await view.addBalloon({
        latitude,
        longitude,
        text: name,
        textStyle: "{text-color:#2C3E50;font-size:16;font-stroke-width:0;}",
        drawOrder: 10,
      });
    });

  return (
    <Screen title="Tap a pin to see balloon" onBack={onBack}>
      <DemoMap
        mapRef={map}
        run={run}
        onReady={ready}
        onMapTap={(event) => showBalloon(event.nativeEvent)}
      />
      <Status text={status} />
    </Screen>
  );
}

export function TrackArrowsDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const request = useRef(new AbortController());
  const route = useRef<GLRoute | null>(null);
  const [title, setTitle] = useState("Building route...");
  const { status, run } = useTasks();
  useEffect(
    () => () => {
      request.current.abort();
      void route.current?.release();
    },
    [],
  );

  const ready = async (view: GLMapViewRef) => {
    // A short scenic route on the Amalfi Coast.
    await view.moveCamera({ center: { latitude: 40.64, longitude: 14.61 }, zoom: 12 }, null);
    // GLMapLineArrow draws one prominent arrow at a route maneuver.
    const arrow = await view.addLineArrow({
      style: "{casing-width:2pt;casing-color:#4285F4FF;width:14pt;color:white;linecap:round;}",
      head: { svg: "route-maneuver-head.svg", scale: 1, tint: "#4285F4" },
      drawOrder: 6,
      hidden: true,
    });
    const { signal } = request.current;
    let built: GLRoute;
    try {
      built = await GLRouteSDK.route(
        {
          points: [
            { latitude: 40.633, longitude: 14.502 },
            { latitude: 40.65, longitude: 14.72 },
          ],
          mode: "car",
          offline: false,
        },
        signal,
      );
    } catch (error) {
      setTitle("Route failed — check network");
      throw error;
    }
    if (signal.aborted) return void built.release();
    route.current = built;
    // fill-image repeats the small arrows over the entire track.
    const track = await view.addTrack({
      style: '{width:14pt; fill-image:"track-arrow.svg";}',
      drawOrder: 5,
    });
    await track.setRoute(built, "#4285F4DC");
    const maneuver = built.maneuverCount > 2 ? await built.maneuver(1) : null;
    if (!maneuver) return;
    await view.setLineArrowManeuver(arrow, built.id, maneuver.index);
    await view.setHidden(arrow, false);
    setTitle("Track Arrows");
    await view.moveCamera(
      { center: { latitude: maneuver.latitude, longitude: maneuver.longitude }, zoom: 17 },
      { flyTo: true, duration: 1.5 },
    );
  };

  return (
    <Screen title={title} onBack={onBack}>
      <DemoMap mapRef={map} run={run} onReady={ready} />
      <Status text={status} />
    </Screen>
  );
}

// A walk along Bryggen in Bergen.
const bergenWalk = [
  { latitude: 60.3913, longitude: 5.3221 },
  { latitude: 60.3922, longitude: 5.3229 },
  { latitude: 60.3932, longitude: 5.3226 },
  { latitude: 60.3943, longitude: 5.3222 },
  { latitude: 60.3954, longitude: 5.3215 },
  { latitude: 60.3966, longitude: 5.3222 },
];

export function UserLocationDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const marker = useRef<number | null>(null);
  const located = useRef(false);
  const { status, setStatus, run } = useTasks("Waiting for location…");

  const feed = useLocationFeed(async (fix: Location) => {
    const view = map.current;
    if (!view || marker.current === null) return;
    const center = { latitude: fix.latitude, longitude: fix.longitude };
    await view.updateUserLocation(marker.current, fix, located.current);
    await view.moveCamera({ center }, located.current ? { duration: 1, linear: true } : null);
    located.current = true;
    setStatus(`${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)} · ±${fix.accuracy.toFixed(0)} m`);
  }, run);

  const ready = async (view: GLMapViewRef) => {
    await view.moveCamera({ center: bergenWalk[0], zoom: 14 }, null);
    marker.current = await view.addUserLocation(100);
    await feed.start();
  };

  return (
    <Screen title="User Location" onBack={onBack}>
      <DemoMap mapRef={map} run={run} onReady={ready} />
      <Status text={status} />
      <Controls>
        <Action title="Replay sample position" onPress={() => feed.replay(bergenWalk)} />
      </Controls>
    </Screen>
  );
}
