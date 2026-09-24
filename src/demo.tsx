import React, { forwardRef, useImperativeHandle, useRef } from "react";
import type { MapState } from "./types";
export type { MapState } from "./types";
import {
  requireNativeModule,
  requireNativeViewManager,
} from "expo-modules-core";
import type { NativeSyntheticEvent, ViewProps } from "react-native";

/** The only rejection codes used by the demo API, identical on iOS and Android. */
export type GLMapErrorCode =
  | "cancelled"
  | "disposed"
  | "invalid_argument"
  | "not_found"
  | "permission_denied"
  | "sdk_error";
const codes: readonly string[] = [
  "cancelled",
  "disposed",
  "invalid_argument",
  "not_found",
  "permission_denied",
  "sdk_error",
];
export function errorCode(error: unknown): GLMapErrorCode | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && codes.includes(code)
    ? (code as GLMapErrorCode)
    : undefined;
}
function failure(code: GLMapErrorCode, message: string) {
  return Object.assign(new Error(message), { code });
}

export type GeoPoint = { latitude: number; longitude: number };
export type Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};
export type DataSet = "map" | "navigation" | "elevation";
export type Subscription = { remove(): void };

export type Region = {
  id: string;
  name: string;
  isCollection: boolean;
  /** Any data set, of the region or its children, is downloaded, paused or in progress. */
  onDevice: boolean;
  downloaded: boolean;
  sizeOnServer: number;
  sizeOnDisk: number;
  /** Bytes of the active download, or null when nothing is downloading. */
  progress: { downloaded: number; total: number } | null;
};
export type RegionProgress = { id: string; downloaded: number; total: number };
export type AreaFile = { dataSet: DataSet; fileName: string };
export type AreaProgress = {
  dataSet: DataSet;
  downloaded: number;
  total: number;
};

export type SearchQuery = {
  text: string;
  type: "search" | "autocomplete";
  offline: boolean;
  center: GeoPoint;
  limit: number;
  categories?: string[];
};
export type Place = GeoPoint & {
  name: string;
  /** Matched ranges of `name` as [start, end) pairs of UTF-16 offsets. */
  nameHighlights: number[];
  detail: string;
};

export type RouteMode = "car" | "bicycle" | "pedestrian";
export type RouteQuery = {
  points: GeoPoint[];
  mode: RouteMode;
  offline: boolean;
};
/** Packed doubles are borrowed until the operation resolves; subarray views are supported. */
export type Coordinates = Float64Array | readonly number[];
const packed = (values: Coordinates): Float64Array => values instanceof Float64Array ? values : Float64Array.from(values);
function packLines(lines: Coordinates[]): Float64Array {
  if (lines.length === 1) return packed(lines[0]);
  const result = new Float64Array(lines.reduce((sum, line) => sum + line.length, 0));
  let offset = 0;
  for (const line of lines) { result.set(line, offset); offset += line.length; }
  return result;
}

export type RouteStep = {
  /** Packed [longitude, latitude] pairs. */
  coordinates: Coordinates;
  instruction: string;
  turn: "continue" | "left" | "right";
  duration: number;
};
export type Maneuver = GeoPoint & {
  index: number;
  /** Valhalla maneuver type. */
  type: number;
  instruction: string;
};
export type Location = GeoPoint & {
  accuracy: number;
  bearing: number | null;
  speed: number | null;
};
export type NavigationState = GeoPoint & {
  maneuver: Maneuver | null;
  distanceToManeuver: number;
  remainingDistance: number;
  remainingDuration: number;
  progress: number;
  onRoute: boolean;
};
type RouteInfo = {
  id: number;
  distance: number;
  duration: number;
  bounds: Bounds;
  maneuverCount: number;
};

type Listener<T> = (event: T) => void;
const native = requireNativeModule<{
  initialize(apiKey: string): Promise<void>;
  setTileDownloadingAllowed(allowed: boolean): Promise<void>;
  addDataSet(asset: string, dataSet: DataSet): Promise<void>;
  regions(parentId: string | null, refresh: boolean): Promise<Region[]>;
  downloadRegion(id: string): Promise<void>;
  cancelRegionDownload(id: string): Promise<void>;
  deleteRegion(id: string): Promise<void>;
  downloadArea(
    requestId: number,
    bounds: Bounds,
    files: AreaFile[],
  ): Promise<void>;
  search(requestId: number, query: SearchQuery): Promise<Place[]>;
  route(requestId: number, query: RouteQuery): Promise<RouteInfo>;
  cancelRequest(requestId: number): Promise<void>;
  buildRoute(steps: Omit<RouteStep, "coordinates">[], coordinates: Float64Array, counts: number[]): Promise<RouteInfo>;
  routeCoordinates(routeId: number): Promise<number[]>;
  maneuver(routeId: number, index: number): Promise<Maneuver | null>;
  updateNavigation(
    routeId: number,
    location: Location,
  ): Promise<NavigationState>;
  releaseRoute(routeId: number): Promise<void>;
  startLocationUpdates(): Promise<void>;
  stopLocationUpdates(): Promise<void>;
  addListener(name: string, listener: Listener<never>): Subscription;
}>("GLMapDemo");

let lastRequest = 0;
/** Aborting the signal cancels the native request; the promise then rejects with `cancelled`. */
function cancellable<T>(
  signal: AbortSignal | undefined,
  start: (requestId: number) => Promise<T>,
): Promise<T> {
  if (signal?.aborted)
    return Promise.reject(failure("cancelled", "Request was cancelled"));
  const requestId = ++lastRequest;
  const abort = () => void native.cancelRequest(requestId);
  signal?.addEventListener("abort", abort);
  return start(requestId).finally(() =>
    signal?.removeEventListener("abort", abort),
  );
}

/** Owns a native GLRoute and its GLRouteTracker until `release()`. */
export class GLRoute {
  readonly id: number;
  readonly distance: number;
  readonly duration: number;
  readonly bounds: Bounds;
  readonly maneuverCount: number;
  constructor(info: RouteInfo) {
    this.id = info.id;
    this.distance = info.distance;
    this.duration = info.duration;
    this.bounds = info.bounds;
    this.maneuverCount = info.maneuverCount;
  }
  /** Packed [longitude, latitude] pairs of the route geometry. */
  coordinates() {
    return native.routeCoordinates(this.id);
  }
  maneuver(index: number) {
    return native.maneuver(this.id, index);
  }
  /** Feeds a position to the route's GLRouteTracker. */
  updateNavigation(location: Location) {
    return native.updateNavigation(this.id, location);
  }
  release() {
    return native.releaseRoute(this.id);
  }
}

export const GLMapSdk = {
  initialize: (apiKey: string) => native.initialize(apiKey),
  setTileDownloadingAllowed: (allowed: boolean) =>
    native.setTileDownloadingAllowed(allowed),
  /** Registers a data set bundled with the module, e.g. `Montenegro.vm`. */
  addDataSet: (asset: string, dataSet: DataSet) =>
    native.addDataSet(asset, dataSet),
  regions: (parentId: string | null, refresh: boolean) =>
    native.regions(parentId, refresh),
  downloadRegion: (id: string) => native.downloadRegion(id),
  cancelRegionDownload: (id: string) => native.cancelRegionDownload(id),
  deleteRegion: (id: string) => native.deleteRegion(id),
  onRegionsChanged: (listener: Listener<{}>) =>
    native.addListener("onRegionsChanged", listener),
  onRegionProgress: (listener: Listener<RegionProgress>) =>
    native.addListener("onRegionProgress", listener),
  /** Downloads and registers data sets of an area; existing files are reused. */
  downloadArea(
    bounds: Bounds,
    files: AreaFile[],
    options: { signal?: AbortSignal; onProgress?: Listener<AreaProgress> } = {},
  ) {
    return cancellable(options.signal, (requestId) => {
      const progress = native.addListener(
        "onAreaProgress",
        (event: AreaProgress & { requestId: number }) => {
          if (event.requestId === requestId) options.onProgress?.(event);
        },
      );
      return native
        .downloadArea(requestId, bounds, files)
        .finally(() => progress.remove());
    });
  },
  search: (query: SearchQuery, signal?: AbortSignal) =>
    cancellable(signal, (requestId) => native.search(requestId, query)),
  route: (query: RouteQuery, signal?: AbortSignal) =>
    cancellable(signal, (requestId) => native.route(requestId, query)).then(
      (info) => new GLRoute(info),
    ),
  /** Builds a route from explicit maneuvers with GLRouteBuilder; no routing request is made. */
  buildRoute: (steps: RouteStep[]) =>
    native.buildRoute(steps.map(({ coordinates, ...step }) => step), packLines(steps.map((step) => step.coordinates)), steps.map((step) => step.coordinates.length)).then((info) => new GLRoute(info)),
  /** Requests foreground permission when needed; rejects with `permission_denied`. */
  startLocationUpdates: () => native.startLocationUpdates(),
  stopLocationUpdates: () => native.stopLocationUpdates(),
  onLocation: (listener: Listener<Location>) =>
    native.addListener("onLocation", listener),
};

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
  pickMapObject(
    x: number,
    y: number,
    distance: number,
  ): Promise<(GeoPoint & { name: string }) | null>;

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
const NativeMapView = requireNativeViewManager("GLMapDemo") as React.ComponentType<GLMapViewProps & React.RefAttributes<NativeMapRef>>;

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
  setRoute(route: GLRoute, color: string) { return this.invoke(() => this.owner.setTrackRoute(this.id, route.id, color)); }
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
    pickMapObject: async (...args) => current().pickMapObject(...args),
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
