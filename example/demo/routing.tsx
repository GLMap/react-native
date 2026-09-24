import { GLRouteSDK } from "@globus-software/glroute";
import React, { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { GeoPoint, GLMapSdk, Location } from "@globus-software/glmap-core";
import { GLMapViewRef, GLMapImage, GLMapTrack, MapTouch } from "@globus-software/glmap";
import { GLRoute, NavigationState, RouteMode } from "@globus-software/glroute";
import {
  Action,
  Controls,
  DemoMap,
  DemoProps,
  formatDistance,
  formatDuration,
  Screen,
  Status,
  useTasks,
} from "./common";
import { useLocationFeed } from "./location";

const modes: { title: string; mode: RouteMode }[] = [
  { title: "Auto", mode: "car" },
  { title: "Bike", mode: "bicycle" },
  { title: "Walk", mode: "pedestrian" },
];

export function RouteBuildingDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const request = useRef<AbortController | null>(null);
  const route = useRef<GLRoute | null>(null);
  const track = useRef<GLMapTrack | null>(null);
  const pins = useRef<number | null>(null);
  const query = useRef({
    departure: { latitude: 41.1457, longitude: -8.6107 }, // Porto, São Bento
    destination: { latitude: 41.1597, longitude: -8.63 }, // Porto, Casa da Música
    mode: "car" as RouteMode,
    offline: false,
  });
  const [mode, setMode] = useState<RouteMode>("car");
  const [offline, setOffline] = useState(false);
  const { status, setStatus, run } = useTasks();
  useEffect(
    () => () => {
      request.current?.abort();
      void route.current?.release();
    },
    [],
  );

  const updateRoute = () =>
    run(async () => {
      const view = map.current;
      if (!view || track.current === null || pins.current === null) return;
      // Only the latest request may update the screen.
      request.current?.abort();
      const { signal } = (request.current = new AbortController());
      const { departure, destination, mode, offline } = query.current;
      await view.setImageGroupPins(pins.current, [
        departure.longitude,
        departure.latitude,
        0,
        destination.longitude,
        destination.latitude,
        1,
      ]);
      setStatus(`Requesting ${offline ? "offline" : "online"} route…`);
      const next = await GLRouteSDK.route({ points: [departure, destination], mode, offline }, signal);
      if (signal.aborted) return void next.release();
      const previous = route.current;
      route.current = next;
      await track.current.setRoute(next, "#32C800C8");
      await previous?.release();
      setStatus(`${formatDistance(next.distance)} · ${formatDuration(next.duration)}`);
    });

  const ready = async (view: GLMapViewRef) => {
    const { departure, destination } = query.current;
    await view.moveCamera(
      {
        bounds: {
          south: Math.min(departure.latitude, destination.latitude),
          west: Math.min(departure.longitude, destination.longitude),
          north: Math.max(departure.latitude, destination.latitude),
          east: Math.max(departure.longitude, destination.longitude),
        },
        zoomDelta: -1,
      },
      null,
    );
    track.current = await view.addTrack({
      style: '{width:7pt; fill-image:"track-arrow.svg";}',
      drawOrder: 5,
    });
    pins.current = await view.addImageGroup({
      images: ["#28B45A", "#E63C3C"].map((tint) => ({ svg: "pin.svg", scale: 1.6, tint })),
      drawOrder: 6,
    });
    updateRoute();
  };
  const choosePoint = ({ latitude, longitude }: MapTouch) => {
    const set = (key: "departure" | "destination") => () => {
      query.current[key] = { latitude, longitude };
      updateRoute();
    };
    Alert.alert("Set Point", undefined, [
      { text: "Departure", onPress: set("departure") },
      { text: "Destination", onPress: set("destination") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <Screen title="Route Building" onBack={onBack}>
      <Controls>
        {modes.map((item) => (
          <Action
            key={item.mode}
            title={item.title}
            selected={mode === item.mode}
            onPress={() => {
              setMode(item.mode);
              query.current.mode = item.mode;
              updateRoute();
            }}
          />
        ))}
        <Action
          title={offline ? "Offline" : "Online"}
          selected={offline}
          onPress={() => {
            setOffline(!offline);
            query.current.offline = !offline;
            updateRoute();
          }}
        />
      </Controls>
      <DemoMap
        mapRef={map}
        run={run}
        onReady={ready}
        onMapTap={(event) => choosePoint(event.nativeEvent)}
      />
      <Status text={status || "Tap map to set departure and destination"} />
    </Screen>
  );
}

// Valhalla maneuver types grouped by the arrow that describes them.
const arrows: [string, number[]][] = [
  ["↗", [2, 9, 18, 20, 23, 37]],
  ["→", [10]],
  ["↘", [11]],
  ["↷", [12]],
  ["↶", [13]],
  ["↙", [14]],
  ["←", [15]],
  ["↖", [3, 16, 19, 21, 24, 38]],
  ["⚑", [4, 5, 6]],
  ["⟳", [26, 27]],
];
const arrowFor = (type: number) => arrows.find(([, types]) => types.includes(type))?.[0] ?? "↑";

// Podgorica: a line with one right turn, replayed without GPS or network.
const sampleLine = [19.246, 42.428, 19.249, 42.432, 19.254, 42.433, 19.258, 42.438, 19.269, 42.44];

export function TurnByTurnDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const request = useRef<AbortController | null>(null);
  const route = useRef<GLRoute | null>(null);
  const replay = useRef<GeoPoint[]>([]);
  const lastFix = useRef<Location | null>(null);
  const drawables = useRef<{ track: GLMapTrack; arrow: number; marker: number } | null>(null);
  const [title, setTitle] = useState("Waiting for location...");
  const [navigation, setNavigation] = useState<NavigationState | null>(null);
  const { status, setStatus, run } = useTasks();
  useEffect(
    () => () => {
      request.current?.abort();
      void route.current?.release();
    },
    [],
  );

  const navigate = async (fix: Location) => {
    const view = map.current;
    const active = route.current;
    if (!view || !active || !drawables.current) return;
    const state = await active.updateNavigation(fix);
    if (active !== route.current) return;
    setNavigation(state);
    const { track, arrow } = drawables.current;
    if (state.maneuver) await view.setLineArrowManeuver(arrow, active.id, state.maneuver.index);
    await view.setHidden(arrow, !state.maneuver);
    await track.setProgress(state.progress, 1);
    // Follow the position snapped to the route.
    await view.moveCamera(
      { center: { latitude: state.latitude, longitude: state.longitude } },
      { duration: 1, linear: true },
    );
  };
  const feed = useLocationFeed(async (fix: Location) => {
    const view = map.current;
    if (!view || !drawables.current) return;
    const first = lastFix.current === null;
    lastFix.current = fix;
    await view.updateUserLocation(drawables.current.marker, fix, !first);
    if (first && !route.current) {
      await view.moveCamera(
        { center: { latitude: fix.latitude, longitude: fix.longitude }, zoom: 14 },
        null,
      );
      setTitle("Tap map to choose destination");
    }
    await navigate(fix);
  }, run);

  const install = async (view: GLMapViewRef, next: GLRoute) => {
    if (!drawables.current) return void next.release();
    const previous = route.current;
    route.current = next;
    setNavigation(null);
    await view.setHidden(drawables.current.arrow, true);
    await drawables.current.track.setRoute(next, "#32C800C8");
    await previous?.release();
    await view.moveCamera({ bounds: next.bounds }, null);
    const line = await next.coordinates();
    replay.current = [];
    for (let i = 0; i < line.length; i += 2)
      replay.current.push({ latitude: line[i + 1], longitude: line[i] });
    setTitle("Turn-by-Turn Navigation");
    setStatus(`${formatDistance(next.distance)} · ${formatDuration(next.duration)}`);
  };
  const buildRoute = (destination: MapTouch) =>
    run(async () => {
      const view = map.current;
      const from = lastFix.current;
      if (!view || !from) return;
      // Only the latest request may update the screen.
      request.current?.abort();
      const { signal } = (request.current = new AbortController());
      setTitle("Building route...");
      let next: GLRoute;
      try {
        next = await GLRouteSDK.route(
          {
            points: [
              { latitude: from.latitude, longitude: from.longitude },
              { latitude: destination.latitude, longitude: destination.longitude },
            ],
            mode: "car",
            offline: false,
          },
          signal,
        );
      } catch (error) {
        if (!signal.aborted) setTitle("Tap map to choose destination");
        throw error;
      }
      if (signal.aborted) return void next.release();
      await install(view, next);
      if (lastFix.current) await navigate(lastFix.current);
    });
  const sampleRoute = () =>
    run(async () => {
      const view = map.current;
      if (!view) return;
      request.current?.abort();
      // GLRouteBuilder makes the tracker reproducible; this is not a road route.
      const next = await GLRouteSDK.buildRoute([
        {
          coordinates: sampleLine.slice(0, 6),
          instruction: "Continue to the crossing",
          turn: "continue",
          duration: 120,
        },
        {
          coordinates: sampleLine.slice(4),
          instruction: "Turn right toward the finish",
          turn: "right",
          duration: 140,
        },
      ]);
      await install(view, next);
      setTitle("Sample route (not a road route)");
    });

  const ready = async (view: GLMapViewRef) => {
    await view.setOptions({ origin: { x: 0.5, y: 0.25 } });
    const track = await view.addTrack({
      style: '{width:14pt; fill-image:"track-arrow.svg";}',
      drawOrder: 99,
      progressColor: "#808080C8",
    });
    const arrow = await view.addLineArrow({
      style: "{casing-width:2pt;casing-color:#32C800FF;width:14pt;color:white;linecap:round;}",
      head: { svg: "route-maneuver-head.svg", scale: 1, tint: "#32C800" },
      drawOrder: 100,
      hidden: true,
    });
    drawables.current = { track, arrow, marker: await view.addUserLocation(101) };
    await feed.start();
  };

  return (
    <Screen title={title} onBack={onBack}>
      <View style={local.panel}>
        <Text style={local.arrow}>{navigation?.maneuver ? arrowFor(navigation.maneuver.type) : " "}</Text>
        <View style={local.texts}>
          <Text style={local.distance}>
            {navigation?.maneuver ? formatDistance(navigation.distanceToManeuver) : "--"}
          </Text>
          <Text style={local.street}>{navigation?.maneuver?.instruction ?? ""}</Text>
          <Text style={local.info}>
            {navigation
              ? `${formatDistance(navigation.remainingDistance)} remaining · ${formatDuration(navigation.remainingDuration)}${navigation.onRoute ? "" : " · off route"}`
              : "Tap map to start navigation"}
          </Text>
        </View>
      </View>
      <DemoMap
        mapRef={map}
        run={run}
        onReady={ready}
        onMapTap={(event) => buildRoute(event.nativeEvent)}
      />
      <Status text={status} />
      <Controls>
        <Action title="Sample route" onPress={sampleRoute} />
        <Action
          title="Replay next position"
          disabled={replay.current.length === 0}
          onPress={() => feed.replay(replay.current)}
        />
      </Controls>
    </Screen>
  );
}

const local = StyleSheet.create({
  panel: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#262626",
  },
  arrow: { width: 48, fontSize: 36, color: "#ffffff", textAlign: "center" },
  texts: { flex: 1 },
  distance: { fontSize: 28, fontWeight: "700", color: "#ffffff" },
  street: { fontSize: 15, color: "#d3d3d3" },
  info: { fontSize: 13, color: "#d3d3d3" },
});
