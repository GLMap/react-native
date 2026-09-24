import React, {forwardRef,useImperativeHandle,useRef} from 'react';
import {requireNativeViewManager} from 'expo-modules-core';
import type {NativeSyntheticEvent,ViewProps} from 'react-native';
import type {GeoPoint,Bounds,Coordinates,Location,TrackSource} from '@globus-software/glmap-core';
import {failure,packed,packLines} from '@globus-software/glmap-core/bridge';
import type {MapState} from './types';
export type {MapState} from './types';
/** An SVG bundled with the module, rendered at `scale` and optionally tinted `#RRGGBB`. */
export type ImageSource = { svg: string; scale: number; tint?: string };
export type CameraUpdate = {
  center?: GeoPoint;
  /** Centers the point in the area left by `visibleInsets`. */
  visibleCenter?: GeoPoint;
  zoom?: number;
  /** Map rotation in degrees, matching captureState(). */
  angle?: number;
  pitch?: number;
  /** Fits the bounds into the visible insets; `zoomDelta` is added to the fitted zoom. */
  bounds?: Bounds;
  zoomDelta?: number;
};
export type CameraAnimation = {
  duration?: number;
  flyTo?: boolean;
  linear?: boolean;
};
export type MapOptions = {
  altitudeScale?: number;
  hillshades?: boolean;
  elevationLines?: boolean;
  slopes?: boolean;
  /** Logical pixels. */
  visibleInsets?: { top: number; left: number; bottom: number; right: number };
  origin?: { x: number; y: number };
  clipping?: { bounds: Bounds; minLevel: number; maxLevel: number };
};
export type RasterSource = {
  /** `{z}`, `{x}`, `{y}` templates; a tile picks one by position. */
  urlTemplates: string[];
  attribution: string;
  cacheName: string;
};
export type VectorSource =
  | { line: Coordinates }
  | { polygon: Coordinates[] }
  | { asset: string };
export type MarkerSource = { asset: string } | { points: Coordinates };
export type MapTouch = GeoPoint & { x: number; y: number };

/** Internal wire interface. Native drawables belong to one view and are released on unmount. */
type NativeMapRef = {
  captureState(): Promise<MapState>;
  setStyleOptions(options: Record<string, string>): Promise<void>;
  /** `null` restores GLMap vector tiles. */
  setTileSource(source: RasterSource | null): Promise<void>;
  setOptions(options: MapOptions): Promise<void>;
  reloadTiles(): Promise<void>;
  /** `null` applies the update immediately; an animation supersedes the previous one. */
  moveCamera(
    update: CameraUpdate,
    animation: CameraAnimation | null,
  ): Promise<void>;
  /** Packed [longitude, latitude] pairs in, packed [x, y] logical pixels out. */
  project(coordinates: Coordinates): Promise<number[]>;
  queryHandle():Promise<number>;
  addImage(
    options: GeoPoint & {
      image: ImageSource;
      anchor: "center" | "bottom";
      drawOrder: number;
      hidden?: boolean;
      scale?: number;
    },
  ): Promise<number>;
  /** A positive `duration` animates the change. */
  updateImage(
    id: number,
    change: Partial<GeoPoint> & { scale?: number },
    duration: number,
  ): Promise<void>;
  addImageGroup(options: {
    images: ImageSource[];
    drawOrder: number;
  }): Promise<number>;
  /** Packed [longitude, latitude, imageIndex] triples. */
  setImageGroupPins(id: number, pins: Coordinates): Promise<void>;
  /** Clustered layers pick the union style by log2(count) and label it with the count. */
  addMarkerLayer(options: {
    markers: { asset?: string };
    images: ImageSource[];
    clustered: boolean;
    labelKey?: string;
    drawOrder: number;
  }, points: Float64Array | null): Promise<{ id: number; bounds: Bounds | null; count: number }>;
  /** Index of a `points` marker near the screen point. */
  pickMarker(
    id: number,
    x: number,
    y: number,
    distance: number,
  ): Promise<number | null>;
  /** Animated add/remove of `points` markers by index. */
  swapMarkers(id: number, show: number[], hide: number[]): Promise<void>;
  addBalloon(
    options: GeoPoint & {
      text: string;
      textStyle: string;
      drawOrder: number;
    },
  ): Promise<number>;
  updateBalloon(
    id: number,
    change: GeoPoint & { text: string; textStyle: string },
  ): Promise<void>;
  addTrack(options: {
    style: string;
    drawOrder: number;
    progressColor?: string;
  }): Promise<number>;
  setTrackRoute(id: number, routeId: number, color: string): Promise<void>;
  appendTrackPoint(id: number, point: GeoPoint, color: string): Promise<void>;
  setTrackProgress(
    id: number,
    progress: number,
    duration: number,
  ): Promise<void>;
  addLineArrow(options: {
    style: string;
    head: ImageSource;
    drawOrder: number;
    hidden?: boolean;
  }): Promise<number>;
  setLineArrowManeuver(
    id: number,
    routeId: number,
    maneuverIndex: number,
  ): Promise<void>;
  addUserLocation(drawOrder: number): Promise<number>;
  updateUserLocation(
    id: number,
    location: Location,
    animated: boolean,
  ): Promise<void>;
  addVectorLayer(options: {
    source: { asset?: string; polygon: boolean; counts: number[] };
    style: string;
    drawOrder: number;
  }, coordinates: Float64Array | null): Promise<{ id: number; bounds: Bounds | null }>;
  /** GeoJSON of the layer's object near the screen point. */
  pickVectorObject(
    id: number,
    x: number,
    y: number,
    distance: number,
  ): Promise<string | null>;
  setHidden(id: number, hidden: boolean): Promise<void>;
  removeDrawable(id: number): Promise<void>;
};
export type GLMapViewProps = ViewProps & {
  /** The native map is attached and sized; camera fitting works from here on. */
  onMapReady?: (event: NativeSyntheticEvent<{}>) => void;
  onMapTap?: (event: NativeSyntheticEvent<MapTouch>) => void;
  onMapLongPress?: (event: NativeSyntheticEvent<MapTouch>) => void;
};
const NativeMapView = requireNativeViewManager("GLMap") as React.ComponentType<GLMapViewProps & React.RefAttributes<NativeMapRef>>;

/** A handle belongs to its creating view and becomes unusable when that view unmounts. */
export abstract class GLMapDrawable {
  private removal?: Promise<void>;
  constructor(protected readonly owner: NativeMapRef, protected readonly id: number, private readonly mounted: () => boolean) {}
  protected invoke(operation: () => Promise<void>): Promise<void> {
    if (!this.mounted()) return Promise.reject(failure("disposed", "Map has been unmounted"));
    return this.removal ? Promise.reject(failure("not_found", "Drawable has been removed")) : operation();
  }
  setHidden(hidden: boolean) { return this.invoke(() => this.owner.setHidden(this.id, hidden)); }
  remove() {
    if (this.removal) return this.removal;
    return this.removal = this.invoke(() => this.owner.removeDrawable(this.id));
  }
}
export class GLMapImage extends GLMapDrawable {
  update(change: Partial<GeoPoint> & { scale?: number }, duration = 0) {
    return this.invoke(() => this.owner.updateImage(this.id, change, duration));
  }
}
export class GLMapTrack extends GLMapDrawable {
  setRoute(route: TrackSource, color: string) { return this.invoke(() => this.owner.setTrackRoute(this.id, route.id, color)); }
  appendPoint(point: GeoPoint, color: string) { return this.invoke(() => this.owner.appendTrackPoint(this.id, point, color)); }
  setProgress(progress: number, duration = 0) { return this.invoke(() => this.owner.setTrackProgress(this.id, progress, duration)); }
}
export type GLMapViewRef = Omit<NativeMapRef, "addImage" | "updateImage" | "addTrack" | "setTrackRoute" | "appendTrackPoint" | "setTrackProgress" | "addMarkerLayer" | "addVectorLayer"> & {
  addMarkerLayer(options: Omit<Parameters<NativeMapRef["addMarkerLayer"]>[0], "markers"> & { markers: MarkerSource }): ReturnType<NativeMapRef["addMarkerLayer"]>;
  addVectorLayer(options: Omit<Parameters<NativeMapRef["addVectorLayer"]>[0], "source"> & { source: VectorSource }): ReturnType<NativeMapRef["addVectorLayer"]>;
  addImage(options: Parameters<NativeMapRef["addImage"]>[0]): Promise<GLMapImage>;
  addTrack(options: Parameters<NativeMapRef["addTrack"]>[0]): Promise<GLMapTrack>;
};

export const GLMapView = forwardRef<GLMapViewRef, GLMapViewProps>((props, ref) => {
  const nativeRef = useRef<NativeMapRef>(null);
  const current = () => {
    if (!nativeRef.current) throw failure("disposed", "Map is not mounted");
    return nativeRef.current;
  };
  useImperativeHandle(ref, () => ({
    captureState: async () => current().captureState(),
    setStyleOptions: async (...args) => current().setStyleOptions(...args),
    setTileSource: async (...args) => current().setTileSource(...args),
    setOptions: async (...args) => current().setOptions(...args),
    reloadTiles: async () => current().reloadTiles(),
    moveCamera: async (...args) => current().moveCamera(...args),
    project: async (values) => current().project(packed(values)),
    queryHandle: async () => current().queryHandle(),
    addImage: async (options) => { const owner = current(); return new GLMapImage(owner, await owner.addImage(options), () => nativeRef.current === owner); },
    addTrack: async (options) => { const owner = current(); return new GLMapTrack(owner, await owner.addTrack(options), () => nativeRef.current === owner); },
    addImageGroup: async (...args) => current().addImageGroup(...args),
    setImageGroupPins: async (id, values) => current().setImageGroupPins(id, packed(values)),
    addMarkerLayer: async (options) => current().addMarkerLayer({ ...options, markers: "points" in options.markers ? {} : options.markers }, "points" in options.markers ? packed(options.markers.points) : null),
    pickMarker: async (...args) => current().pickMarker(...args),
    swapMarkers: async (...args) => current().swapMarkers(...args),
    addBalloon: async (...args) => current().addBalloon(...args),
    updateBalloon: async (...args) => current().updateBalloon(...args),
    addLineArrow: async (...args) => current().addLineArrow(...args),
    setLineArrowManeuver: async (...args) => current().setLineArrowManeuver(...args),
    addUserLocation: async (...args) => current().addUserLocation(...args),
    updateUserLocation: async (...args) => current().updateUserLocation(...args),
    addVectorLayer: async (options) => {
      const source = options.source;
      const lines = "line" in source ? [source.line] : "polygon" in source ? source.polygon : [];
      return current().addVectorLayer({ ...options, source: { asset: "asset" in source ? source.asset : undefined, polygon: "polygon" in source, counts: lines.map((line) => line.length) } }, "asset" in source ? null : packLines(lines));
    },
    pickVectorObject: async (...args) => current().pickVectorObject(...args),
    setHidden: async (...args) => current().setHidden(...args),
    removeDrawable: async (...args) => current().removeDrawable(...args),
  }), []);
  return <NativeMapView {...props} ref={nativeRef} />;
});
