import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (isToday) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function isLive(startTime?: number, endTime?: number): boolean {
  if (!startTime) return false;
  const now = Date.now();
  return now >= startTime && (!endTime || now <= endTime);
}

type BeaconContent = {
  title?: string;
  description?: string;
  locationAddress?: string;
  startTime?: number;
  endTime?: number;
};

function CanvasBeaconList({ canvasId }: { canvasId: Id<"canvases"> }) {
  const router = useRouter();
  const beacons = useQuery(api.beacons.getActiveBeacons, { canvasId });

  if (!beacons || beacons.length === 0) return null;

  const beaconItems = beacons
    .filter((b) => b.type === "beacon")
    .map((b) => ({
      _id: b._id,
      content: b.content as BeaconContent,
      creatorName: b.creatorName,
    }))
    .sort((a, b) => (a.content.startTime ?? 0) - (b.content.startTime ?? 0));

  if (beaconItems.length === 0) return null;

  return (
    <View style={styles.section}>
      {beaconItems.map((item) => {
        const live = isLive(item.content.startTime, item.content.endTime);
        return (
          <Pressable
            key={item._id}
            style={({ pressed }) => [
              styles.beaconCard,
              pressed && styles.beaconCardPressed,
            ]}
            onPress={() => router.push(`/beacon/${item._id}`)}
          >
            {live && (
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            )}
            <Text style={styles.beaconCreator}>
              <Text style={styles.dot}>■ </Text>
              {(item.creatorName ?? "unknown").toUpperCase()}
            </Text>
            <Text style={styles.beaconTitle}>
              {item.content.title ?? "Beacon"}
            </Text>
            <View style={styles.metaRow}>
              {item.content.startTime && (
                <Text style={styles.beaconMeta}>
                  <Text style={styles.dot}>■ </Text>
                  {formatTime(item.content.startTime)}
                </Text>
              )}
              {item.content.locationAddress && (
                <Text style={styles.beaconMeta}>
                  <Text style={styles.dot}>■ </Text>
                  {item.content.locationAddress}
                </Text>
              )}
            </View>
            {item.content.description && (
              <Text style={styles.beaconDescription} numberOfLines={2}>
                {item.content.description}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function BeaconsScreen() {
  const router = useRouter();
  const canvases = useQuery(api.access.getAccessibleCanvases);

  const friendCanvases = useMemo(
    () => canvases?.filter((c: any) => c.role !== "owner") ?? [],
    [canvases]
  );

  if (canvases === undefined) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>BEACONS</Text>
        </View>
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator color="#00ff88" size="large" />
        </View>
        <FAB onPress={() => router.push("/beacon/create")} />
      </View>
    );
  }

  if (friendCanvases.length === 0) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>BEACONS</Text>
        </View>
        <View style={[styles.container, styles.centered]}>
          <FontAwesome name="bolt" size={48} color="#00ff88" style={{ marginBottom: 16, opacity: 0.4 }} />
          <Text style={styles.emptyTitle}>NO BEACONS YET</Text>
          <Text style={styles.emptySubtitle}>
            When friends create beacons, they'll show up here
          </Text>
        </View>
        <FAB onPress={() => router.push("/beacon/create")} />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BEACONS</Text>
      </View>
      <FlatList
        style={styles.container}
        data={friendCanvases}
        keyExtractor={(item: any) => item._id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }: any) => (
          <CanvasBeaconList canvasId={item._id} />
        )}
      />
      <FAB onPress={() => router.push("/beacon/create")} />
    </View>
  );
}

function FAB({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      onPress={onPress}
    >
      <FontAwesome name="plus" size={20} color="#0a0a1a" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#0a0a1a",
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#0a0a1a",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "GeistPixel",
    fontSize: 32,
    color: "#00ff88",
  },
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontFamily: "VT323",
    fontSize: 22,
    color: "#e8e0d4",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: "SpaceGrotesk",
    fontSize: 14,
    color: "#555",
    textAlign: "center",
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  section: {
    gap: 12,
    marginBottom: 8,
  },
  beaconCard: {
    backgroundColor: "#0d1117",
    borderRadius: 4,
    padding: 16,
    borderWidth: 2,
    borderColor: "#1a3a2a",
    gap: 8,
    position: "relative",
  },
  beaconCardPressed: {
    opacity: 0.7,
  },
  liveBadge: {
    position: "absolute",
    top: -1,
    right: -1,
    backgroundColor: "#00ff88",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 2,
  },
  liveBadgeText: {
    fontFamily: "VT323",
    fontSize: 14,
    color: "#0a0a1a",
    letterSpacing: 1,
  },
  beaconCreator: {
    fontFamily: "VT323",
    fontSize: 16,
    color: "#00ff88",
    letterSpacing: 1,
  },
  dot: {
    color: "#00ff88",
  },
  beaconTitle: {
    fontFamily: "SpaceGrotesk",
    fontSize: 22,
    color: "#e8e0d4",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  beaconMeta: {
    fontFamily: "VT323",
    fontSize: 16,
    color: "#00ccff",
  },
  beaconDescription: {
    fontFamily: "SpaceGrotesk",
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 4,
    backgroundColor: "#fbbf24",
    borderWidth: 2,
    borderColor: "#fbbf24",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#fbbf24",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
