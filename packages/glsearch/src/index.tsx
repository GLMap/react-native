import {requireNativeModule} from 'expo-modules-core';
import type {GeoPoint, MapQueryTarget} from '@globus-software/glmap-core';
import {cancellable} from '@globus-software/glmap-core/bridge';
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


const native=requireNativeModule<{
 search(id:number,query:SearchQuery):Promise<Place[]>;
 cancelRequest(id:number):Promise<void>;
 pickMapObject(id:number,x:number,y:number,distance:number):Promise<Place|null>;
}>('GLSearch');
export const GLSearch = {
 search:(query:SearchQuery,signal?:AbortSignal)=>cancellable(native,signal,id=>native.search(id,query)),
 pickMapObject:async(map:MapQueryTarget,x:number,y:number,distance:number)=>native.pickMapObject(await map.queryHandle(),x,y,distance),
};
