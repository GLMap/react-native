import {requireNativeModule} from 'expo-modules-core';
import type {GeoPoint, Bounds, Coordinates, Location, TrackSource} from '@globus-software/glmap-core';
import {cancellable,packLines} from '@globus-software/glmap-core/bridge';
export type RouteMode = "car" | "bicycle" | "pedestrian";
export type RouteQuery = {
  points: GeoPoint[];
  mode: RouteMode;
  offline: boolean;
};
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


const native=requireNativeModule<{
 route(id:number,query:RouteQuery):Promise<RouteInfo>;
 cancelRequest(id:number):Promise<void>;
 buildRoute(steps:Omit<RouteStep,'coordinates'>[],coordinates:Float64Array,counts:number[]):Promise<RouteInfo>;
 routeCoordinates(id:number):Promise<number[]>;
 maneuver(id:number,index:number):Promise<Maneuver|null>;
 updateNavigation(id:number,location:Location):Promise<NavigationState>;
 releaseRoute(id:number):Promise<void>;
}>('GLRoute');
/** Owns a native GLRoute and its GLRouteTracker until `release()`. */
export class GLRoute implements TrackSource {
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


export const GLRouteSDK = {
 route:(query:RouteQuery,signal?:AbortSignal)=>cancellable(native,signal,id=>native.route(id,query)).then(info=>new GLRoute(info)),
 buildRoute:(steps:RouteStep[])=>native.buildRoute(steps.map(({coordinates,...step})=>step),packLines(steps.map(s=>s.coordinates)),steps.map(s=>s.coordinates.length)).then(info=>new GLRoute(info)),
};
