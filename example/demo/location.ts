import { useEffect, useRef } from "react";
import { GeoPoint, GLMapSdk, Location } from "glmap-rn/demo";

function bearing(from: GeoPoint, to: GeoPoint) {
  const radians = Math.PI / 180;
  const dLon = (to.longitude - from.longitude) * radians;
  const y = Math.sin(dLon) * Math.cos(to.latitude * radians);
  const x =
    Math.cos(from.latitude * radians) * Math.sin(to.latitude * radians) -
    Math.sin(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.cos(dLon);
  return ((Math.atan2(y, x) / radians) + 360) % 360;
}

/** Delivers fixes to `onFix` one at a time; `replay` feeds sample coordinates through the same path. */
export function useLocationFeed(onFix: (fix: Location) => Promise<void>, run: (task: () => Promise<void>) => void) {
  const handler = useRef(onFix);
  handler.current = onFix;
  const queue = useRef(Promise.resolve());
  const replayed = useRef<{ samples: GeoPoint[]; next: number }>({ samples: [], next: 0 });

  const deliver = (fix: Location) => {
    queue.current = queue.current.then(
      () => new Promise<void>((done) => run(() => handler.current(fix).finally(done))),
    );
  };
  useEffect(() => {
    const subscription = GLMapSdk.onLocation(deliver);
    return () => {
      subscription.remove();
      void GLMapSdk.stopLocationUpdates();
    };
  }, []);

  return {
    /** Asks for foreground permission when needed. */
    start: () => GLMapSdk.startLocationUpdates(),
    replay(samples: GeoPoint[]) {
      if (samples.length === 0) return;
      if (replayed.current.samples !== samples) replayed.current = { samples, next: 0 };
      const index = replayed.current.next++ % samples.length;
      const previous = samples[(index + samples.length - 1) % samples.length];
      deliver({
        ...samples[index],
        accuracy: 10,
        bearing: index === 0 ? null : bearing(previous, samples[index]),
        speed: index === 0 ? null : 5,
      });
    },
  };
}
