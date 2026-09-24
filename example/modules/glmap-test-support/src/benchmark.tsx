import React from 'react';
import { requireNativeViewManager } from 'expo-modules-core';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

// This native view is a timing control, not the public SDK map. Only BenchmarkApp
// may import it; the catalog, lifecycle sample and API checks use GLMapView.
export type BenchmarkCamera = {
  latitude: number; longitude: number; zoom: number; angle?: number; pitch?: number;
};
export type BenchmarkMapRef = {
  captureState(): Promise<Required<BenchmarkCamera> & { scale: number; originX: number; originY: number }>;
  setCamera(camera: BenchmarkCamera): Promise<void>;
  benchEcho(sequence: number): Promise<number>;
  benchPayload(values: number[]): Promise<number[]>;
  benchGeometry(values: number[]): Promise<number[]>;
  benchPayloadBuffer(values: Float64Array | Uint8Array): Promise<number[]>;
  benchGeometryBuffer(values: Float64Array | Uint8Array): Promise<number[]>;
  benchNative(points: number): Promise<number[]>;
  benchRestyle(alternate: boolean): Promise<number[]>;
  benchStatus(): Promise<number[]>;
  benchReadback(): Promise<string>;
};
type BenchmarkMapProps = ViewProps & {
  fixture: string;
  onReady?: (event: NativeSyntheticEvent<{ surfaceAvailable: boolean }>) => void;
  onFailure?: (event: NativeSyntheticEvent<{ message: string }>) => void;
};

export const BenchmarkMap = requireNativeViewManager('GLMapTestSupport') as
  React.ComponentType<BenchmarkMapProps & React.RefAttributes<BenchmarkMapRef>>;
