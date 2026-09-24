import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, SectionList, StyleSheet, Text, TextInput } from "react-native";
import {
  AreaProgress,
  Bounds,
  DataSet,
  GLMapSdk,
  GLMapViewRef,
  Region,
} from "glmap-rn/demo";
import { DemoMap, DemoProps, Screen, Status, styles, useTasks } from "./common";

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

function describeRegion(region: Region) {
  if (region.isCollection) return "Browse regions";
  if (region.progress)
    return region.progress.total > 0
      ? `Downloading ${((region.progress.downloaded * 100) / region.progress.total).toFixed(1)}%`
      : "Starting download...";
  return region.downloaded
    ? `On device · ${megabytes(region.sizeOnDisk)}`
    : megabytes(region.sizeOnServer);
}

export function DownloadMapsDemo({ onBack }: DemoProps) {
  // Collections opened on the way to the current list.
  const [path, setPath] = useState<Region[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [filter, setFilter] = useState("");
  const { status, setStatus, run } = useTasks();
  const parent = path.length > 0 ? path[path.length - 1] : null;

  useEffect(() => {
    let current = true;
    const load = (refresh: boolean) =>
      run(async () => {
        const next = await GLMapSdk.regions(parent?.id ?? null, refresh);
        if (!current) return;
        setRegions(next.sort((a, b) => a.name.localeCompare(b.name)));
        if (refresh) setStatus("");
      });
    load(false);
    if (!parent) {
      setStatus("Updating the map list…");
      load(true);
    }
    const changed = GLMapSdk.onRegionsChanged(() => load(false));
    const progress = GLMapSdk.onRegionProgress(({ id, downloaded, total }) =>
      setRegions((list) =>
        list.map((region) =>
          region.id === id ? { ...region, progress: { downloaded, total } } : region,
        ),
      ),
    );
    return () => {
      current = false;
      changed.remove();
      progress.remove();
    };
  }, [parent?.id]);

  const open = (region: Region) => {
    if (region.isCollection) {
      setFilter("");
      setPath([...path, region]);
    } else if (region.progress) {
      run(() => GLMapSdk.cancelRegionDownload(region.id));
    } else if (region.downloaded) {
      Alert.alert(`Delete ${region.name} from this device?`, undefined, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => run(() => GLMapSdk.deleteRegion(region.id)),
        },
      ]);
    } else {
      run(() => GLMapSdk.downloadRegion(region.id));
    }
  };

  const visible = regions.filter((region) =>
    region.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const sections = [
    { title: "ON DEVICE", data: visible.filter((region) => region.onDevice) },
    { title: "AVAILABLE", data: visible.filter((region) => !region.onDevice) },
  ].filter((section) => section.data.length > 0);

  return (
    <Screen
      title={parent?.name ?? "Download Maps"}
      onBack={parent ? () => setPath(path.slice(0, -1)) : onBack}
    >
      <TextInput
        style={local.filter}
        value={filter}
        onChangeText={setFilter}
        placeholder="Search maps"
        autoCorrect={false}
      />
      <Status text={status} />
      <SectionList
        sections={sections}
        keyExtractor={(region) => region.id}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => <Text style={local.section}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable style={local.row} onPress={() => open(item)}>
            <Text style={local.name}>
              {item.name}
              {item.isCollection ? " ›" : ""}
            </Text>
            <Text style={styles.status}>{describeRegion(item)}</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

// A part of Florence
const area: Bounds = { south: 43.73, west: 11.2, north: 43.8, east: 11.3 };

export function DownloadBBoxDemo({ onBack }: DemoProps) {
  const map = useRef<GLMapViewRef>(null);
  const download = useRef(new AbortController());
  const progress = useRef<Partial<Record<DataSet, AreaProgress>>>({});
  const { status, setStatus, run } = useTasks();
  useEffect(() => {
    // Show only what has been downloaded for the area.
    run(() => GLMapSdk.setTileDownloadingAllowed(false));
    return () => {
      download.current.abort();
      void GLMapSdk.setTileDownloadingAllowed(true);
    };
  }, []);

  const ready = async (view: GLMapViewRef) => {
    await view.moveCamera({ bounds: area }, null);
    await view.setOptions({ clipping: { bounds: area, minLevel: 9, maxLevel: 16 } });
    setStatus("Downloading map + nav + elevation...");
    await GLMapSdk.downloadArea(
      area,
      [
        { dataSet: "map", fileName: "bbox_map.vmtar" },
        { dataSet: "navigation", fileName: "bbox_nav.navtar" },
        { dataSet: "elevation", fileName: "bbox_ele.eletar" },
      ],
      {
        signal: download.current.signal,
        onProgress(event) {
          progress.current[event.dataSet] = event;
          setStatus(
            Object.values(progress.current)
              .map((item) => `${item.dataSet} ${megabytes(item.downloaded)}`)
              .join(" · "),
          );
        },
      },
    );
    await view.setOptions({ elevationLines: true, hillshades: true });
    await view.reloadTiles();
    setStatus("All data downloaded");
  };

  return (
    <Screen title="Download BBox" onBack={onBack}>
      <DemoMap mapRef={map} run={run} onReady={ready} />
      <Status text={status} />
    </Screen>
  );
}

const local = StyleSheet.create({
  filter: {
    height: 40,
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#b7c0cc",
    borderRadius: 7,
    paddingHorizontal: 8,
    backgroundColor: "#ffffff",
  },
  section: { fontSize: 12, color: "#666666", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  row: { paddingVertical: 8, paddingHorizontal: 4, backgroundColor: "#ffffff" },
  name: { fontSize: 16, color: "#172B4D", paddingHorizontal: 12 },
});
