import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";

type Status = "joining" | "interested" | "declined";

const STATUS_CONFIG: Record<Status, { label: string; color: string }> = {
  joining: { label: "JOINING", color: "#00ff88" },
  interested: { label: "MAYBE", color: "#fbbf24" },
  declined: { label: "PASS", color: "#ff3366" },
};

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  if (isToday) return `Today at ${time}`;
  if (isTomorrow) return `Tomorrow at ${time}`;
  return `${date} at ${time}`;
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

export default function BeaconDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const beaconId = id as Id<"canvasObjects">;

  const beacon = useQuery(api.objects.getById, { id: beaconId });
  const responses = useQuery(api.responses.getByBeacon, { beaconId });
  const respond = useMutation(api.responses.respond);
  const removeResponse = useMutation(api.responses.removeResponse);

  const handleRSVP = async (status: Status) => {
    try {
      await respond({ beaconId, status });
    } catch (e: any) {
      console.warn("RSVP failed:", e.message);
    }
  };

  const handleRemoveRSVP = async () => {
    try {
      await removeResponse({ beaconId });
    } catch (e: any) {
      console.warn("Remove RSVP failed:", e.message);
    }
  };

  if (beacon === undefined || responses === undefined) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#00ff88" size="large" />
      </View>
    );
  }

  const content = (beacon?.content ?? {}) as BeaconContent;
  const live = isLive(content.startTime, content.endTime);

  const grouped: Record<Status, typeof responses> = {
    joining: responses.filter((r) => r.status === "joining"),
    interested: responses.filter((r) => r.status === "interested"),
    declined: responses.filter((r) => r.status === "declined"),
  };

  const totalResponses = grouped.joining.length + grouped.interested.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Beacon info */}
      <View style={styles.beaconHeader}>
        <View style={styles.statusRow}>
          {live && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          )}
          <Text style={styles.creatorName}>
            <Text style={styles.dot}>■ </Text>
            {((beacon as any)?.creatorName ?? "UNKNOWN").toUpperCase()}
          </Text>
        </View>

        <Text style={styles.beaconTitle}>{content.title ?? "Beacon"}</Text>

        {content.description && (
          <Text style={styles.beaconDescription}>{content.description}</Text>
        )}

        {content.startTime && (
          <Text style={styles.beaconMeta}>
            <Text style={styles.dot}>■ </Text>
            {formatDateTime(content.startTime)}
            {content.endTime ? ` — ${formatDateTime(content.endTime)}` : ""}
          </Text>
        )}
        {content.locationAddress && (
          <Text style={styles.beaconMeta}>
            <Text style={styles.dot}>■ </Text>
            {content.locationAddress}
          </Text>
        )}
      </View>

      {/* RSVP Buttons */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>SELECT RESPONSE</Text>
        <View style={styles.sectionLine} />
      </View>

      <View style={styles.rsvpRow}>
        {(["joining", "interested", "declined"] as Status[]).map((status) => {
          const config = STATUS_CONFIG[status];
          return (
            <Pressable
              key={status}
              style={({ pressed }) => [
                styles.rsvpButton,
                { borderColor: config.color },
                pressed && styles.rsvpButtonPressed,
              ]}
              onPress={() => handleRSVP(status)}
            >
              <Text style={[styles.rsvpLabel, { color: config.color }]}>
                {config.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.clearButton} onPress={handleRemoveRSVP}>
        <Text style={styles.clearButtonText}>Clear response</Text>
      </Pressable>

      {/* Party list */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>PARTY</Text>
        <View style={styles.sectionLine} />
        <Text style={styles.partyCount}>{totalResponses}/{responses.length}</Text>
      </View>

      {responses.length === 0 ? (
        <Text style={styles.emptyText}>No responses yet</Text>
      ) : (
        <View style={styles.responseList}>
          {responses.map((r) => {
            const status = r.status as Status;
            const config = STATUS_CONFIG[status] ?? { label: status.toUpperCase(), color: "#555" };
            return (
              <View key={r._id} style={styles.responseRow}>
                <View style={[styles.responseAvatar, { borderColor: config.color }]}>
                  <Text style={styles.responseAvatarText}>
                    {(r.displayName ?? r.username ?? "?")[0].toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.responseName}>
                  {r.displayName ?? r.username ?? "Unknown"}
                </Text>
                <Text style={[styles.responseStatus, { color: config.color }]}>
                  {config.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}
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
    padding: 32,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  beaconHeader: {
    gap: 10,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  liveBadge: {
    backgroundColor: "#00ff88",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 2,
  },
  liveBadgeText: {
    fontFamily: "VT323",
    fontSize: 14,
    color: "#0a0a1a",
    letterSpacing: 1,
  },
  creatorName: {
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
    fontSize: 28,
    color: "#e8e0d4",
  },
  beaconDescription: {
    fontFamily: "SpaceGrotesk",
    fontSize: 15,
    color: "rgba(255,255,255,0.5)",
    lineHeight: 22,
  },
  beaconMeta: {
    fontFamily: "VT323",
    fontSize: 18,
    color: "#00ccff",
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
    color: "#e8e0d4",
    letterSpacing: 1,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#1a3a2a",
  },
  partyCount: {
    fontFamily: "VT323",
    fontSize: 18,
    color: "#00ff88",
  },
  rsvpRow: {
    flexDirection: "row",
    gap: 10,
  },
  rsvpButton: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 4,
    padding: 14,
    alignItems: "center",
    backgroundColor: "#0d1117",
  },
  rsvpButtonPressed: {
    opacity: 0.6,
  },
  rsvpLabel: {
    fontFamily: "VT323",
    fontSize: 18,
    letterSpacing: 1,
  },
  clearButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  clearButtonText: {
    fontFamily: "VT323",
    color: "#555",
    fontSize: 16,
  },
  responseList: {
    gap: 4,
  },
  responseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#0d1117",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#1a2a22",
  },
  responseAvatar: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: "#fbbf24",
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  responseAvatarText: {
    fontFamily: "SpaceGrotesk-Bold",
    fontSize: 16,
    color: "#0a0a1a",
  },
  responseName: {
    fontFamily: "SpaceGrotesk",
    fontSize: 15,
    color: "#e8e0d4",
    flex: 1,
  },
  responseStatus: {
    fontFamily: "VT323",
    fontSize: 16,
    letterSpacing: 1,
  },
  emptyText: {
    fontFamily: "VT323",
    color: "#555",
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
  },
});
