import React from "react";
import {
  requireNativeModule,
  requireNativeViewManager,
} from "expo-modules-core";
import type { NativeSyntheticEvent, ViewProps } from "react-native";

export type Camera = {
  latitude: number;
  longitude: number;
  zoom: number;
  angle?: number;
  pitch?: number;
};
export type MapState = Required<Camera> & {
  scale: number;
  originX: number;
  originY: number;
};
export type UpdateResult =
  | "ready"
  | "superseded"
  | "cancelled"
  | "failed"
  | "removed";
export type Diagnostics = {
  surfaceAvailable: boolean;
  width: number;
  height: number;
  taps: number;
  moves: number;
  layers: { id: number; count: number; geoJson: string | null }[];
};
export type GLMapRef = {
  captureState(): Promise<MapState>;
  setCamera(camera: Camera): Promise<void>;
  createVectorLayer(drawOrder: number): Promise<number>;
  /** Packed pairs are [longitude, latitude]. Input is copied to native arrays by Expo. */
  mutateVectorLayer(
    id: number,
    operation: "replace" | "style" | "remove",
    coordinates: number[] | null,
    geoJson: string | null,
    style: string | null,
  ): Promise<UpdateResult>;
  diagnostics(): Promise<Diagnostics>;
  dispose(): Promise<void>;
};
export type GLMapProps = ViewProps & {
  fixture: string;
  onReady?: (
    event: NativeSyntheticEvent<{ surfaceAvailable: boolean }>,
  ) => void;
  onMapTap?: (
    event: NativeSyntheticEvent<{ x: number; y: number; count: number }>,
  ) => void;
  onFailure?: (event: NativeSyntheticEvent<{ message: string }>) => void;
};
export const GLMap = requireNativeViewManager(
  "GLMapLab",
) as React.ComponentType<GLMapProps & React.RefAttributes<GLMapRef>>;
export const lab = requireNativeModule<{
  saveResults(json: string): Promise<string>;
  saveBenchmarkResults(json: string): Promise<string>;
}>("GLMapLab");
