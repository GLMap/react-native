import { GLSearch } from "@globus-software/glsearch";
import React, { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { GLMapImage, GLMapViewRef, MapTouch } from "@globus-software/glmap";
import { GLMapSdk } from "@globus-software/glmap-core";
import { Place } from "@globus-software/glsearch";
import { Action, DemoMap, DemoProps, Screen, Status, styles, useTasks } from "./common";

// Podgorica, inside the bundled Montenegro map, so offline requests have data.
const center = { latitude: 42.4341, longitude: 19.26 };

/** The search engine reports the matched ranges of a name. */
function HighlightedName({ place }: { place: Place }) {
  const parts: React.ReactNode[] = [];
  let end = 0;
  for (let i = 0; i < place.nameHighlights.length; i += 2) {
    const [from, to] = [place.nameHighlights[i], place.nameHighlights[i + 1]];
    parts.push(place.name.slice(end, from));
    parts.push(
      <Text key={i} style={local.match}>
        {place.name.slice(from, to)}
      </Text>,
    );
    end = to;
  }
  return (
    <Text style={local.name}>
      {parts}
      {place.name.slice(end)}
    </Text>
  );
}

export function SearchDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const list = useRef<FlatList<Place>>(null);
  const request = useRef<AbortController | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markers = useRef<number | null>(null);
  const selectedPin = useRef<GLMapImage | null>(null);
  const query = useRef({ text: "", offline: false });
  const [text, setText] = useState("");
  const [offline, setOffline] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [title, setTitle] = useState("Search");
  const { status, setStatus, run } = useTasks();
  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
      request.current?.abort();
    },
    [],
  );

  const search = (type: "search" | "autocomplete") =>
    run(async () => {
      const view = map.current;
      if (!view) return;
      if (debounce.current) clearTimeout(debounce.current);
      // Only the latest request may update the screen.
      request.current?.abort();
      const { signal } = (request.current = new AbortController());
      const { text: term, offline: useOffline } = query.current;
      const source = useOffline ? "Offline" : "Online";
      setTitle(`Searching ${source.toLowerCase()}...`);
      setStatus("");
      let places: Place[];
      try {
        places = await GLSearch.search(
          {
            text: term,
            type,
            offline: useOffline,
            center,
            limit: 50,
            // An empty query browses a category near the center.
            ...(term.trim() === "" ? { categories: ["restaurant"] } : {}),
          },
          signal,
        );
      } catch (error) {
        if (!signal.aborted) setTitle(`${source} Search Failed`);
        throw error;
      }
      if (signal.aborted) return;
      if (markers.current !== null) await view.removeDrawable(markers.current);
      markers.current = null;
      if (selectedPin.current !== null) await selectedPin.current.setHidden(true);
      setSelected(null);
      setResults(places);
      setTitle(`${source}: ${places.length} results`);
      if (places.length === 0) return;
      const layer = await view.addMarkerLayer({
        markers: { points: places.flatMap((place) => [place.longitude, place.latitude]) },
        images: [{ svg: "cluster.svg", scale: 0.2, tint: "#0066CC" }],
        clustered: false,
        drawOrder: 3,
      });
      if (signal.aborted) return void view.removeDrawable(layer.id);
      markers.current = layer.id;
      if (layer.bounds) await view.moveCamera({ bounds: layer.bounds }, null);
    });

  const ready = async (view: GLMapViewRef) => {
    await GLMapSdk.addDataSet("Montenegro.vm", "map");
    await view.setOptions({ visibleInsets: { top: 20, left: 20, bottom: 20, right: 20 } });
    await view.moveCamera({ center, zoom: 12 }, null);
    selectedPin.current = await view.addImage({
      ...center,
      image: { svg: "pin.svg", scale: 1.4, tint: "#E63C3C" },
      anchor: "bottom",
      drawOrder: 4,
      hidden: true,
      scale: 0.01,
    });
    search("search");
  };

  const select = (index: number) =>
    run(async () => {
      const view = map.current;
      const place = results[index];
      if (!view || !place || markers.current === null || selectedPin.current === null) return;
      const point = { latitude: place.latitude, longitude: place.longitude };
      if (index !== selected) {
        // The layer swaps the chosen circle for the previous one while a pin grows in its place.
        await view.swapMarkers(markers.current, selected === null ? [] : [selected], [index]);
        await selectedPin.current.update({ ...point, scale: 0.01 }, 0);
        await selectedPin.current.setHidden(false);
        setSelected(index);
        list.current?.scrollToIndex({ index, viewPosition: 0.5 });
      }
      await selectedPin.current.update({ scale: 1 }, 0.3);
      await view.moveCamera({ visibleCenter: point }, { duration: 0.3 });
    });
  const selectMarker = (touch: MapTouch) =>
    run(async () => {
      if (markers.current === null) return;
      const hit = await map.current?.pickMarker(markers.current, touch.x, touch.y, 24);
      if (hit !== null && hit !== undefined) select(hit);
    });

  const changeText = (value: string) => {
    setText(value);
    query.current.text = value;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search("autocomplete"), 300);
  };
  const changeSource = (value: boolean) => {
    setOffline(value);
    query.current.offline = value;
    search("search");
  };

  return (
    <Screen title={title} onBack={onBack}>
      <View style={local.panel}>
        <TextInput
          style={local.input}
          value={text}
          onChangeText={changeText}
          onSubmitEditing={() => search("search")}
          placeholder="Search places (empty = nearby restaurants)"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Action title="Online" selected={!offline} onPress={() => changeSource(false)} />
        <Action title="Offline" selected={offline} onPress={() => changeSource(true)} />
      </View>
      <DemoMap
        mapRef={map}
        run={run}
        onReady={ready}
        style={local.map}
        onMapTap={(event) => selectMarker(event.nativeEvent)}
      />
      <Status text={status} />
      <FlatList
        ref={list}
        style={local.list}
        data={results}
        keyExtractor={(_, index) => String(index)}
        keyboardShouldPersistTaps="handled"
        // Rows that are not measured yet cannot be scrolled to; the selection still shows.
        onScrollToIndexFailed={() => {}}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => select(index)}
            style={[local.row, index === selected && local.rowSelected]}
          >
            <HighlightedName place={item} />
            {item.detail ? <Text style={styles.status}>{item.detail}</Text> : null}
          </Pressable>
        )}
      />
    </Screen>
  );
}

export function POITapDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const balloon = useRef<number | null>(null);
  const [title, setTitle] = useState("Tap to find POI");
  const { status, run } = useTasks();

  const ready = (view: GLMapViewRef) =>
    // Florence
    view.moveCamera({ center: { latitude: 43.7696, longitude: 11.2558 }, zoom: 16 }, null);
  const identify = (touch: MapTouch) =>
    run(async () => {
      const view = map.current;
      if (!view) return;
      if (balloon.current !== null) await view.removeDrawable(balloon.current);
      balloon.current = null;
      const found = await GLSearch.pickMapObject(view,touch.x, touch.y, 20);
      if (!found) return setTitle("No POI here");
      const { name, latitude, longitude } = found;
      balloon.current = await view.addBalloon({
        latitude,
        longitude,
        text: name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        textStyle: "{text-color:black;font-size:14;}",
        drawOrder: 10,
      });
      setTitle(name || "Unknown");
    });

  return (
    <Screen title={title} onBack={onBack}>
      <DemoMap
        mapRef={map}
        run={run}
        onReady={ready}
        onMapTap={(event) => identify(event.nativeEvent)}
      />
      <Status text={status} />
    </Screen>
  );
}

const local = StyleSheet.create({
  panel: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#b7c0cc",
    borderRadius: 7,
    paddingHorizontal: 8,
    backgroundColor: "#ffffff",
  },
  map: { flex: 3 },
  list: { flex: 2, backgroundColor: "#ffffff" },
  row: { paddingHorizontal: 4, paddingVertical: 8 },
  rowSelected: { backgroundColor: "#E6EEFF" },
  name: { fontSize: 15, color: "#172B4D", paddingHorizontal: 12 },
  match: { color: "#0066CC" },
});
