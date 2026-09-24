import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  errorCode,
  GLMapView,
  GLMapViewProps,
  GLMapViewRef,
} from "glmap-rn/demo";

export type DemoProps = { onBack: () => void };
export type Demo = {
  category: string;
  title: string;
  subtitle: string;
  screen: React.ComponentType<DemoProps>;
};

export function describe(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return `${errorCode(error) ?? "error"}: ${message.split("\n")[0]}`;
}

/** Runs screen work; a cancelled request or an unmounted map is not an error to show. */
export function useTasks(initial = "") {
  const [status, setStatus] = useState(initial);
  const run = useCallback((task: () => Promise<void>) => {
    task().catch((error) => {
      const code = errorCode(error);
      if (code !== "cancelled" && code !== "disposed") setStatus(describe(error));
    });
  }, []);
  return { status, setStatus, run };
}

export function Screen(props: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const back = useRef(props.onBack);
  back.current = props.onBack;
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      back.current();
      return true;
    });
    return () => subscription.remove();
  }, []);
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={props.onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
        >
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {props.title}
        </Text>
      </View>
      {props.children}
    </SafeAreaView>
  );
}

/** A map with the insets every demo uses; `onReady` runs once the native map is sized. */
export function DemoMap(
  props: Omit<GLMapViewProps, "onMapReady"> & {
    mapRef: React.RefObject<GLMapViewRef | null>;
    onReady: (map: GLMapViewRef) => Promise<void>;
    run: (task: () => Promise<void>) => void;
  },
) {
  const { mapRef, onReady, run, style, ...rest } = props;
  return (
    <GLMapView
      ref={mapRef}
      style={[styles.map, style]}
      onMapReady={() =>
        run(async () => {
          const map = mapRef.current;
          if (!map) return;
          const inset = 16;
          await map.setOptions({
            visibleInsets: {
              top: inset,
              left: inset,
              bottom: inset,
              right: inset,
            },
          });
          await onReady(map);
        })
      }
      {...rest}
    />
  );
}

export function Controls(props: { children: React.ReactNode }) {
  return <View style={styles.controls}>{props.children}</View>;
}
export function Status(props: { text: string }) {
  return props.text ? <Text style={styles.status}>{props.text}</Text> : null;
}
export function Action(props: {
  title: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected, disabled: props.disabled }}
      style={[
        styles.action,
        props.selected && styles.actionSelected,
        props.disabled && styles.actionDisabled,
      ]}
    >
      <Text style={[styles.actionText, props.selected && styles.actionTextSelected]}>
        {props.title}
      </Text>
    </Pressable>
  );
}

export function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  return meters < 1000
    ? `${Math.round(meters / 10) * 10} m`
    : `${(meters / 1000).toFixed(1)} km`;
}
export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f5f8" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 44,
  },
  back: { fontSize: 17, color: "#2650D6", paddingRight: 12 },
  title: { flex: 1, fontSize: 17, fontWeight: "600", color: "#172B4D" },
  map: { flex: 1 },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  status: { fontSize: 13, color: "#44546F", paddingHorizontal: 12, paddingVertical: 6 },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2650D6",
  },
  actionSelected: { backgroundColor: "#2650D6" },
  actionDisabled: { opacity: 0.4 },
  actionText: { fontSize: 14, color: "#2650D6" },
  actionTextSelected: { color: "#ffffff" },
});
