import React, { useRef, useState } from "react";
import { Bounds, GLMapViewRef } from "glmap-rn/demo";
import { Action, Controls, DemoMap, DemoProps, Screen, Status, useTasks } from "./common";

const destinations = [
  { name: "Porto", latitude: 41.1579, longitude: -8.6291 },
  { name: "San Sebastián", latitude: 43.3183, longitude: -1.9812 },
  { name: "Lucerne", latitude: 47.0502, longitude: 8.3093 },
  { name: "Bruges", latitude: 51.2093, longitude: 3.2247 },
  { name: "Dubrovnik", latitude: 42.6507, longitude: 18.0944 },
  { name: "Tallinn", latitude: 59.437, longitude: 24.7536 },
];

export function FlyToDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const [index, setIndex] = useState(0);
  const { status, run } = useTasks();

  const flyTo = async (view: GLMapViewRef, next: number) => {
    const { latitude, longitude } = destinations[next];
    setIndex(next);
    await view.moveCamera({ center: { latitude, longitude }, zoom: 14 }, { flyTo: true });
  };

  return (
    <Screen title={destinations[index].name} onBack={onBack}>
      <DemoMap mapRef={map} run={run} onReady={(view) => flyTo(view, 0)} />
      <Status text={status} />
      <Controls>
        <Action
          title="Fly"
          onPress={() =>
            run(async () => {
              if (map.current)
                await flyTo(map.current, (index + 1) % destinations.length);
            })
          }
        />
      </Controls>
    </Screen>
  );
}

// Berlin, Paris, London, Rome, Madrid, Warsaw, Vienna, Prague as [longitude, latitude]
const cities = [
  13.4102, 52.5037, 2.3343, 48.8505, -0.1275, 51.5072, 12.4829, 41.8933,
  -3.7038, 40.4168, 21.0103, 52.2251, 16.3738, 48.2082, 14.4378, 50.0755,
];

export function ZoomToBBoxDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const bounds = useRef<Bounds | null>(null);
  const { status, run } = useTasks();

  const ready = async (view: GLMapViewRef) => {
    const layer = await view.addVectorLayer({
      source: { line: cities },
      style: "line{width:4pt; color:#E74C3C;}",
      drawOrder: 5,
    });
    bounds.current = layer.bounds;
    if (layer.bounds) await view.moveCamera({ bounds: layer.bounds }, null);
  };
  const zoomToFit = () =>
    run(async () => {
      if (bounds.current)
        await map.current?.moveCamera(
          { bounds: bounds.current },
          { flyTo: true, duration: 2 },
        );
    });

  return (
    <Screen title="Zoom to BBox" onBack={onBack}>
      <DemoMap mapRef={map} run={run} onReady={ready} />
      <Status text={status} />
      <Controls>
        <Action title="Zoom to Fit" onPress={zoomToFit} />
      </Controls>
    </Screen>
  );
}
