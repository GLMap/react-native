import { requireNativeModule } from "expo-modules-core";
import { cancellable } from "./bridge";
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

export type Location = GeoPoint & {
  accuracy: number;
  bearing: number | null;
  speed: number | null;
};
export type TrackSource = { readonly id: number };
export type MapQueryTarget = { queryHandle(): Promise<number> };
export type { Coordinates } from './bridge';
type Listener<T> = (event:T)=>void;
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
  cancelRequest(requestId:number):Promise<void>;
  startLocationUpdates(): Promise<void>;
  stopLocationUpdates(): Promise<void>;
  addListener(name: string, listener: Listener<never>): Subscription;
}>("GLMapCore");

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
    return cancellable(native, options.signal, (requestId) => {
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
  /** Requests foreground permission when needed; rejects with `permission_denied`. */
  startLocationUpdates: () => native.startLocationUpdates(),
  stopLocationUpdates: () => native.stopLocationUpdates(),
  onLocation: (listener: Listener<Location>) =>
    native.addListener("onLocation", listener),
};
