import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { authClient } from "@/src/lib/auth-client";

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

function MyBeacons({ canvasId }: { canvasId: Id<"canvases"> }) {
  const router = useRouter();
  const beacons = useQuery(api.beacons.getActiveBeacons, { canvasId });

  if (!beacons || beacons.length === 0) return null;

  const beaconItems = beacons
    .filter((b) => b.type === "beacon")
    .map((b) => ({
      _id: b._id,
      content: b.content as BeaconContent,
    }))
    .sort((a, b) => (a.content.startTime ?? 0) - (b.content.startTime ?? 0));

  if (beaconItems.length === 0) return null;

  return (
    <>
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
          </Pressable>
        );
      })}
    </>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const session = authClient.useSession();
  const canvases = useQuery(api.access.getAccessibleCanvases);

  const myCanvases = useMemo(
    () => canvases?.filter((c: any) => c.role === "owner") ?? [],
    [canvases]
  );

  if (session.isPending) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#00ff88" size="large" />
      </View>
    );
  }

  const user = session.data?.user;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.screenTitle}>PROFILE</Text>

      {/* Avatar + Info */}
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name ?? "?")[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.displayName}>{user?.name ?? "Unknown"}</Text>
        <Text style={styles.username}>@{user?.username ?? "unknown"}</Text>
      </View>

      {/* My Beacons section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>MY BEACONS</Text>
        <View style={styles.sectionLine} />
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.newBeaconButton,
          pressed && styles.newBeaconButtonPressed,
        ]}
        onPress={() => router.push("/beacon/create")}
      >
        <Text style={styles.newBeaconText}>+ NEW BEACON</Text>
      </Pressable>

      <View style={styles.beaconList}>
        {myCanvases.map((canvas: any) => (
          <MyBeacons key={canvas._id} canvasId={canvas._id} />
        ))}
      </View>

      {/* Sign out */}
      <Pressable
        style={({ pressed }) => [
          styles.signOutButton,
          pressed && styles.signOutButtonPressed,
        ]}
        onPress={() => authClient.signOut()}
      >
        <Text style={styles.signOutText}>SIGN OUT</Text>
      </Pressable>

      <Text style={styles.versionText}>v0.0.1</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 24,
    paddingTop: 60,
    gap: 20,
    paddingBottom: 60,
  },
  screenTitle: {
    fontFamily: "VT323",
    fontSize: 24,
    color: "#e8e0d4",
    textAlign: "center",
    letterSpacing: 2,
  },
  profileSection: {
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 4,
    backgroundColor: "#fbbf24",
    borderWidth: 3,
    borderColor: "#00ff88",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  avatarText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 36,
    color: "#0a0a1a",
  },
  displayName: {
    fontFamily: "SpaceGrotesk",
    fontSize: 22,
    color: "#e8e0d4",
  },
  username: {
    fontFamily: "VT323",
    fontSize: 18,
    color: "#00ff88",
    letterSpacing: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  sectionTitle: {
    fontFamily: "VT323",
    fontSize: 18,
    color: "#00ff88",
    letterSpacing: 1,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#1a3a2a",
  },
  beaconList: {
    gap: 10,
  },
  beaconCard: {
    backgroundColor: "#0d1117",
    borderRadius: 4,
    padding: 14,
    borderWidth: 2,
    borderColor: "#1a3a2a",
    gap: 6,
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
  beaconTitle: {
    fontFamily: "SpaceGrotesk",
    fontSize: 18,
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
  dot: {
    color: "#00ff88",
  },
  newBeaconButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#00ff88",
    borderStyle: "dashed",
    borderRadius: 4,
    padding: 14,
  },
  newBeaconButtonPressed: {
    opacity: 0.6,
  },
  newBeaconText: {
    fontFamily: "VT323",
    color: "#00ff88",
    fontSize: 20,
    letterSpacing: 1,
  },
  signOutButton: {
    borderRadius: 4,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#ff3366",
    marginTop: 8,
  },
  signOutButtonPressed: {
    opacity: 0.6,
  },
  signOutText: {
    fontFamily: "VT323",
    color: "#ff3366",
    fontSize: 20,
    letterSpacing: 1,
  },
  versionText: {
    fontFamily: "VT323",
    color: "#444",
    fontSize: 16,
    textAlign: "center",
    marginTop: 8,
  },
});
