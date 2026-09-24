import React, { useEffect, useRef, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GLMapSdk } from "@globus-software/glmap-core";
import { FlyToDemo, ZoomToBBoxDemo } from "./demo/camera";
import { Action, Demo, describe } from "./demo/common";
import {
  BalloonDemo,
  ImageDemo,
  ImageGroupDemo,
  MarkerClusteringDemo,
  TrackArrowsDemo,
  UserLocationDemo,
} from "./demo/drawObjects";
import { DarkThemeDemo, OnlineMapDemo, TerrainDemo } from "./demo/mapDisplay";
import { DownloadBBoxDemo, DownloadMapsDemo } from "./demo/offline";
import { RouteBuildingDemo, TurnByTurnDemo } from "./demo/routing";
import { POITapDemo, SearchDemo } from "./demo/search";
import { GeoJSONDemo, GPSTrackDemo, LinesPolygonsDemo } from "./demo/vectorData";

const demos: Demo[] = [
  { category: "Map Display", title: "Online Map", subtitle: "Vector tiles, custom raster source, tap interaction", screen: OnlineMapDemo },
  { category: "Map Display", title: "Dark Theme", subtitle: "GLMapStyleParser with theme options", screen: DarkThemeDemo },
  { category: "Map Display", title: "3D Terrain", subtitle: "Altitude scale, pitch, hillshades, elevation lines", screen: TerrainDemo },
  { category: "Camera", title: "Fly To", subtitle: "GLMapAnimation.flyToMode", screen: FlyToDemo },
  { category: "Camera", title: "Zoom to BBox", subtitle: "mapScaleForBBox, animate to fit", screen: ZoomToBBoxDemo },
  { category: "Draw Objects", title: "Image", subtitle: "GLMapImage — tap to place and move a pin", screen: ImageDemo },
  { category: "Draw Objects", title: "Image Group", subtitle: "GLMapImageGroup — many pins, shared images", screen: ImageGroupDemo },
  { category: "Draw Objects", title: "Markers & Clustering", subtitle: "GLMapMarkerLayer with clustering", screen: MarkerClusteringDemo },
  { category: "Draw Objects", title: "Balloon", subtitle: "GLMapBalloon — text callout on tap", screen: BalloonDemo },
  { category: "Draw Objects", title: "Track Arrows", subtitle: "GLMapTrack fill image and GLMapLineArrow", screen: TrackArrowsDemo },
  { category: "Draw Objects", title: "User Location", subtitle: "Foreground location and sample replay", screen: UserLocationDemo },
  { category: "Vector Data", title: "Lines & Polygons", subtitle: "GLMapVectorLayer with line and polygon", screen: LinesPolygonsDemo },
  { category: "Vector Data", title: "GeoJSON", subtitle: "Load file, display, tap to identify", screen: GeoJSONDemo },
  { category: "Vector Data", title: "GPS Track", subtitle: "GLMapTrack recording live GPS data", screen: GPSTrackDemo },
  { category: "Search", title: "Search", subtitle: "Online and Offline requests", screen: SearchDemo },
  { category: "Search", title: "POI Tap", subtitle: "Tap map labels to identify objects", screen: POITapDemo },
  { category: "Routing", title: "Route Building", subtitle: "GLRouteRequest online/offline", screen: RouteBuildingDemo },
  { category: "Routing", title: "Turn-by-Turn Navigation", subtitle: "Live location, GLRouteTracker, maneuvers", screen: TurnByTurnDemo },
  { category: "Offline Data", title: "Download Maps", subtitle: "Browse, search, and manage offline maps", screen: DownloadMapsDemo },
  { category: "Offline Data", title: "Download BBox", subtitle: "Download map + nav + elevation for area", screen: DownloadBBoxDemo },
];
const sections = [...new Set(demos.map((demo) => demo.category))].map((title) => ({
  title,
  data: demos.filter((demo) => demo.category === title),
}));

// Inlined at build time from the ignored config/local.json; see scripts/demo-env.mjs.
const configuredKey = process.env.EXPO_PUBLIC_GLMAP_API_KEY ?? "";

export default function DemoApp() {
  const [demo, setDemo] = useState<Demo | null>(null);
  const [ready, setReady] = useState(false);
  const [keySource, setKeySource] = useState(configuredKey ? "local config" : "not set");
  const [editingKey, setEditingKey] = useState(false);
  const [enteredKey, setEnteredKey] = useState("");
  const [failure, setFailure] = useState("");
  const [diagnostic, setDiagnostic] = useState<'api' | 'lifecycle' | null>(null);
  const activeKey = useRef(configuredKey);

  const initialize = async (apiKey: string) => {
    try {
      await GLMapSdk.initialize(apiKey);
      await GLMapSdk.setTileDownloadingAllowed(true);
      activeKey.current = apiKey;
      setFailure("");
      setReady(true);
    } catch (error) {
      setFailure(describe(error));
    }
  };
  useEffect(() => void initialize(configuredKey), []);
  const applyKey = async () => {
    await initialize(enteredKey.trim());
    setKeySource(enteredKey.trim() ? "entered for this session" : "not set");
    setEnteredKey("");
    setEditingKey(false);
  };

  if (diagnostic) {
    const Diagnostic = (diagnostic === 'api'
      ? require('./DemoApiChecks').default
      : require('./LifecycleApp').default) as React.ComponentType<{ apiKey?: string; onBack?: () => void }>;
    return <Diagnostic apiKey={activeKey.current} onBack={() => {
      setReady(false);
      setDiagnostic(null);
      void initialize(activeKey.current);
    }} />;
  }

  const Screen = demo?.screen;
  return (
    <SafeAreaProvider>
      {Screen ? (
        <Screen onBack={() => setDemo(null)} />
      ) : (
        <SafeAreaView style={styles.root}>
          <Text style={styles.heading}>GLMap · React Native</Text>
          <View style={styles.key}>
            <Text style={styles.keySource}>API key: {keySource}</Text>
            <Action title="API key" onPress={() => setEditingKey(!editingKey)} />
          </View>
          <View style={styles.key}>
            <Action title="Lifecycle checks" disabled={!ready} onPress={() => setDiagnostic('lifecycle')} />
            <Action title="API checks" disabled={!ready} onPress={() => setDiagnostic('api')} />
          </View>
          {editingKey && (
            <View style={styles.key}>
              <TextInput
                style={styles.input}
                value={enteredKey}
                onChangeText={setEnteredKey}
                placeholder="Key for this session; not stored"
                secureTextEntry
                autoCorrect={false}
                autoCapitalize="none"
              />
              <Action title="Apply" onPress={() => void applyKey()} />
            </View>
          )}
          {failure ? <Text style={styles.failure}>{failure}</Text> : null}
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.title}
            renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                disabled={!ready}
                accessibilityRole="button"
                onPress={() => setDemo(item)}
              >
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.subtitle}>{item.subtitle}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f5f8" },
  heading: { fontSize: 24, fontWeight: "700", color: "#172B4D", paddingHorizontal: 16, paddingTop: 8 },
  key: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#b7c0cc",
    borderRadius: 7,
    paddingHorizontal: 8,
    backgroundColor: "#ffffff",
  },
  failure: { fontSize: 13, color: "#B42318", paddingHorizontal: 16, paddingBottom: 6 },
  section: { fontSize: 13, fontWeight: "600", color: "#44546F", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  row: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#ffffff", marginBottom: 1 },
  title: { fontSize: 16, color: "#172B4D" },
  subtitle: { fontSize: 13, color: "#44546F" },
  keySource: { flex: 1, fontSize: 13, color: "#44546F" },
});
