import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { api } from "@backend/_generated/api";

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 1000;
const MAX_LOCATION = 500;
const URL_RE = /https?:\/\/|ftp:\/\//i;

function roundToNext15(date: Date): Date {
  const d = new Date(date);
  const mins = d.getMinutes();
  const next = Math.ceil(mins / 15) * 15;
  d.setMinutes(next, 0, 0);
  return d;
}

function getTonight(): Date {
  const d = new Date();
  d.setHours(19, 0, 0, 0);
  if (d.getTime() <= Date.now()) {
    d.setHours(20, 0, 0, 0);
  }
  return d;
}

function getTomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

const TIME_PILLS = [
  { label: "In 30 min", getTime: () => new Date(Date.now() + 30 * 60_000) },
  { label: "In 1 hour", getTime: () => new Date(Date.now() + 60 * 60_000) },
  { label: "In 2 hours", getTime: () => new Date(Date.now() + 120 * 60_000) },
  { label: "Tonight", getTime: getTonight },
  { label: "Tomorrow", getTime: getTomorrow },
] as const;

const DURATION_PILLS = [
  { label: "1 hr", ms: 60 * 60_000 },
  { label: "2 hrs", ms: 2 * 60 * 60_000 },
  { label: "3 hrs", ms: 3 * 60 * 60_000 },
  { label: "All day", ms: 12 * 60 * 60_000 },
] as const;

type Visibility = "everyone" | "specific";

function formatPreview(d: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today at ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow at ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
}

export default function CreateBeaconScreen() {
  const router = useRouter();
  const friends = useQuery(api.friendships.getFriends);
  const createBeacon = useMutation(api.beacons.createMyBeacon);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [selectedTimePill, setSelectedTimePill] = useState<number | null>(null);
  const [selectedDurationPill, setSelectedDurationPill] = useState(1);
  const [customEndTime, setCustomEndTime] = useState<Date | null>(null);
  const [visibility, setVisibility] = useState<Visibility>("everyone");
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [tempPickerDate, setTempPickerDate] = useState(roundToNext15(new Date()));

  const computedStart = useMemo(() => {
    if (selectedTimePill !== null && selectedTimePill < TIME_PILLS.length) {
      return TIME_PILLS[selectedTimePill].getTime();
    }
    return startTime;
  }, [selectedTimePill, startTime]);

  const computedEnd = useMemo(() => {
    if (customEndTime) return customEndTime;
    if (!computedStart) return null;
    return new Date(computedStart.getTime() + DURATION_PILLS[selectedDurationPill].ms);
  }, [computedStart, selectedDurationPill, customEndTime]);

  const allSelected = friends && friends.length > 0 && selectedFriends.size === friends.length;

  function selectTimePill(index: number) {
    setSelectedTimePill(index);
    setStartTime(null);
    setShowStartPicker(false);
    setErrors((e) => ({ ...e, time: "" }));
  }

  function openCustomStart() {
    setSelectedTimePill(null);
    setTempPickerDate(startTime ?? roundToNext15(new Date()));
    setShowStartPicker(true);
    setShowEndPicker(false);
  }

  function onStartPickerChange(_event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === "android") {
      setShowStartPicker(false);
      if (_event.type === "set" && date) {
        setStartTime(date);
        setErrors((e) => ({ ...e, time: "" }));
      }
    } else if (date) {
      setTempPickerDate(date);
    }
  }

  function confirmStartPicker() {
    setStartTime(tempPickerDate);
    setShowStartPicker(false);
    setErrors((e) => ({ ...e, time: "" }));
  }

  function selectDurationPill(index: number) {
    setSelectedDurationPill(index);
    setCustomEndTime(null);
    setShowEndPicker(false);
  }

  function openCustomEnd() {
    const base = computedStart ?? new Date();
    setTempPickerDate(customEndTime ?? new Date(base.getTime() + 2 * 60 * 60_000));
    setShowEndPicker(true);
    setShowStartPicker(false);
  }

  function onEndPickerChange(_event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === "android") {
      setShowEndPicker(false);
      if (_event.type === "set" && date) {
        setCustomEndTime(date);
      }
    } else if (date) {
      setTempPickerDate(date);
    }
  }

  function confirmEndPicker() {
    setCustomEndTime(tempPickerDate);
    setShowEndPicker(false);
  }

  function toggleFriend(uuid: string) {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
    setErrors((e) => ({ ...e, friends: "" }));
  }

  function toggleSelectAll() {
    if (!friends) return;
    if (allSelected) {
      setSelectedFriends(new Set());
    } else {
      setSelectedFriends(new Set(friends.map((f) => f.uuid)));
    }
    setErrors((e) => ({ ...e, friends: "" }));
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) newErrors.title = "Title is required";
    else if (title.length > MAX_TITLE)
      newErrors.title = `Title must be ${MAX_TITLE} characters or less`;

    if (description.length > MAX_DESCRIPTION)
      newErrors.description = `Description must be ${MAX_DESCRIPTION} characters or less`;

    if (location.length > MAX_LOCATION)
      newErrors.location = `Location must be ${MAX_LOCATION} characters or less`;
    if (location && URL_RE.test(location))
      newErrors.location = "Location cannot contain URLs";

    if (!computedStart) newErrors.time = "Pick a start time";
    else if (computedStart.getTime() < Date.now() - 60_000)
      newErrors.time = "Start time cannot be in the past";

    if (computedStart && computedEnd && computedEnd.getTime() <= computedStart.getTime())
      newErrors.time = "End time must be after start time";

    if (visibility === "specific" && selectedFriends.size === 0)
      newErrors.friends = "Select at least one friend";

    setErrors(newErrors);
    return Object.values(newErrors).every((v) => !v);
  }

  async function handleSubmit() {
    if (!validate() || !computedStart || !computedEnd) return;

    setSubmitting(true);
    try {
      await createBeacon({
        title: title.trim(),
        description: description.trim() || undefined,
        locationAddress: location.trim() || undefined,
        startTime: computedStart.getTime(),
        endTime: computedEnd.getTime(),
        recipientUuids:
          visibility === "specific" ? [...selectedFriends] : undefined,
      });
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to create beacon");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* --- What --- */}
      <Text style={styles.sectionLabel}>WHAT</Text>
      <TextInput
        style={[styles.input, errors.title ? styles.inputError : null]}
        placeholder="What's the plan?"
        placeholderTextColor="#555"
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          if (errors.title) setErrors((e) => ({ ...e, title: "" }));
        }}
        maxLength={MAX_TITLE}
      />
      {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}

      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Description (optional)"
        placeholderTextColor="#555"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={MAX_DESCRIPTION}
      />
      {errors.description ? (
        <Text style={styles.errorText}>{errors.description}</Text>
      ) : null}

      <TextInput
        style={[styles.input, errors.location ? styles.inputError : null]}
        placeholder="Location (optional)"
        placeholderTextColor="#555"
        value={location}
        onChangeText={(t) => {
          setLocation(t);
          if (errors.location) setErrors((e) => ({ ...e, location: "" }));
        }}
        maxLength={MAX_LOCATION}
      />
      {errors.location ? (
        <Text style={styles.errorText}>{errors.location}</Text>
      ) : null}

      {/* --- When --- */}
      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>WHEN</Text>
      <View style={styles.pillRow}>
        {TIME_PILLS.map((pill, i) => (
          <Pressable
            key={pill.label}
            style={[styles.pill, selectedTimePill === i && styles.pillActive]}
            onPress={() => selectTimePill(i)}
          >
            <Text
              style={[
                styles.pillText,
                selectedTimePill === i && styles.pillTextActive,
              ]}
            >
              {pill.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[
            styles.pill,
            startTime && selectedTimePill === null && styles.pillActive,
          ]}
          onPress={openCustomStart}
        >
          <Text
            style={[
              styles.pillText,
              startTime && selectedTimePill === null && styles.pillTextActive,
            ]}
          >
            Custom
          </Text>
        </Pressable>
      </View>

      {showStartPicker && (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={tempPickerDate}
            mode="datetime"
            minimumDate={new Date()}
            onChange={onStartPickerChange}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            themeVariant="dark"
          />
          {Platform.OS === "ios" && (
            <Pressable style={styles.pickerDone} onPress={confirmStartPicker}>
              <Text style={styles.pickerDoneText}>DONE</Text>
            </Pressable>
          )}
        </View>
      )}

      {computedStart && (
        <Text style={styles.timePreview}>
          Starts: {formatPreview(computedStart)}
        </Text>
      )}
      {errors.time ? <Text style={styles.errorText}>{errors.time}</Text> : null}

      {/* Duration */}
      <Text style={[styles.subLabel, { marginTop: 12 }]}>DURATION</Text>
      <View style={styles.pillRow}>
        {DURATION_PILLS.map((pill, i) => (
          <Pressable
            key={pill.label}
            style={[
              styles.pill,
              !customEndTime && selectedDurationPill === i && styles.pillActive,
            ]}
            onPress={() => selectDurationPill(i)}
          >
            <Text
              style={[
                styles.pillText,
                !customEndTime &&
                  selectedDurationPill === i &&
                  styles.pillTextActive,
              ]}
            >
              {pill.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.pill, customEndTime && styles.pillActive]}
          onPress={openCustomEnd}
        >
          <Text
            style={[styles.pillText, customEndTime && styles.pillTextActive]}
          >
            Custom
          </Text>
        </Pressable>
      </View>

      {showEndPicker && (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={tempPickerDate}
            mode="datetime"
            minimumDate={computedStart ?? new Date()}
            onChange={onEndPickerChange}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            themeVariant="dark"
          />
          {Platform.OS === "ios" && (
            <Pressable style={styles.pickerDone} onPress={confirmEndPicker}>
              <Text style={styles.pickerDoneText}>DONE</Text>
            </Pressable>
          )}
        </View>
      )}

      {computedEnd && (
        <Text style={styles.timePreview}>
          Ends: {formatPreview(computedEnd)}
        </Text>
      )}

      {/* --- Who can see --- */}
      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>SEND TO</Text>
      <View style={styles.visibilityRow}>
        <Pressable
          style={[
            styles.visibilityOption,
            visibility === "everyone" && styles.visibilityActive,
          ]}
          onPress={() => setVisibility("everyone")}
        >
          <Text
            style={[
              styles.visibilityText,
              visibility === "everyone" && styles.visibilityTextActive,
            ]}
          >
            EVERYONE
          </Text>
          <Text style={styles.visibilityHint}>All friends who visit your Orbyt</Text>
        </Pressable>
        <Pressable
          style={[
            styles.visibilityOption,
            visibility === "specific" && styles.visibilityActive,
          ]}
          onPress={() => setVisibility("specific")}
        >
          <Text
            style={[
              styles.visibilityText,
              visibility === "specific" && styles.visibilityTextActive,
            ]}
          >
            SPECIFIC
          </Text>
          <Text style={styles.visibilityHint}>Only people you pick</Text>
        </Pressable>
      </View>

      {visibility === "specific" && (
        <View style={styles.friendList}>
          {errors.friends ? (
            <Text style={styles.errorText}>{errors.friends}</Text>
          ) : null}

          {friends === undefined ? (
            <ActivityIndicator color="#00ff88" style={{ marginVertical: 16 }} />
          ) : friends.length === 0 ? (
            <Text style={styles.emptyText}>
              No friends yet — add friends on the web app
            </Text>
          ) : (
            <>
              <Pressable style={styles.selectAllRow} onPress={toggleSelectAll}>
                <View
                  style={[styles.checkbox, allSelected && styles.checkboxActive]}
                >
                  {allSelected && <Text style={styles.checkmark}>&#10003;</Text>}
                </View>
                <Text style={styles.selectAllText}>SELECT ALL</Text>
              </Pressable>

              {friends.map((friend) => {
                const selected = selectedFriends.has(friend.uuid);
                return (
                  <Pressable
                    key={friend.uuid}
                    style={styles.friendRow}
                    onPress={() => toggleFriend(friend.uuid)}
                  >
                    <View
                      style={[styles.checkbox, selected && styles.checkboxActive]}
                    >
                      {selected && <Text style={styles.checkmark}>&#10003;</Text>}
                    </View>
                    <View style={styles.friendAvatar}>
                      <Text style={styles.friendAvatarText}>
                        {(friend.displayName ?? friend.username ?? "?")[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.friendName}>
                      {friend.displayName ?? friend.username}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      )}

      {/* --- Submit --- */}
      <Pressable
        style={({ pressed }) => [
          styles.submitButton,
          pressed && styles.submitButtonPressed,
          submitting && styles.submitButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#0a0a1a" />
        ) : (
          <Text style={styles.submitButtonText}>SEND BEACON</Text>
        )}
      </Pressable>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
  },
  content: {
    padding: 20,
  },
  sectionLabel: {
    fontFamily: "VT323",
    fontSize: 20,
    color: "#00ff88",
    marginBottom: 10,
    letterSpacing: 1,
  },
  subLabel: {
    fontFamily: "VT323",
    fontSize: 16,
    color: "#555",
    marginBottom: 8,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: "#0d1117",
    borderRadius: 4,
    padding: 14,
    fontFamily: "SpaceGrotesk",
    fontSize: 16,
    color: "#e8e0d4",
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#1a3a2a",
  },
  inputError: {
    borderColor: "#ff3366",
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  errorText: {
    fontFamily: "VT323",
    color: "#ff3366",
    fontSize: 16,
    marginTop: -6,
    marginBottom: 8,
    marginLeft: 4,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: "#0d1117",
    borderWidth: 2,
    borderColor: "#1a3a2a",
  },
  pillActive: {
    backgroundColor: "#00ff88",
    borderColor: "#00ff88",
  },
  pillText: {
    fontFamily: "VT323",
    color: "#555",
    fontSize: 16,
  },
  pillTextActive: {
    color: "#0a0a1a",
  },
  pickerContainer: {
    backgroundColor: "#0d1117",
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#1a3a2a",
  },
  pickerDone: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pickerDoneText: {
    fontFamily: "VT323",
    color: "#00ff88",
    fontSize: 18,
    letterSpacing: 1,
  },
  timePreview: {
    fontFamily: "VT323",
    color: "#00ccff",
    fontSize: 16,
    marginBottom: 4,
    marginLeft: 4,
  },
  visibilityRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  visibilityOption: {
    flex: 1,
    backgroundColor: "#0d1117",
    borderRadius: 4,
    padding: 14,
    borderWidth: 2,
    borderColor: "#1a3a2a",
    gap: 4,
  },
  visibilityActive: {
    borderColor: "#00ff88",
  },
  visibilityText: {
    fontFamily: "VT323",
    color: "#555",
    fontSize: 18,
    letterSpacing: 1,
  },
  visibilityTextActive: {
    color: "#00ff88",
  },
  visibilityHint: {
    fontFamily: "SpaceGrotesk",
    color: "#444",
    fontSize: 12,
  },
  friendList: {
    marginBottom: 4,
  },
  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a3a2a",
    marginBottom: 4,
  },
  selectAllText: {
    fontFamily: "VT323",
    color: "#e8e0d4",
    fontSize: 18,
    letterSpacing: 1,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#0d1117",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#1a3a2a",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxActive: {
    backgroundColor: "#00ff88",
    borderColor: "#00ff88",
  },
  checkmark: {
    color: "#0a0a1a",
    fontSize: 14,
    fontWeight: "bold",
  },
  friendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: "#fbbf24",
    justifyContent: "center",
    alignItems: "center",
  },
  friendAvatarText: {
    fontFamily: "SpaceGrotesk-Bold",
    color: "#0a0a1a",
    fontSize: 16,
  },
  friendName: {
    fontFamily: "SpaceGrotesk",
    color: "#e8e0d4",
    fontSize: 15,
    flex: 1,
  },
  emptyText: {
    fontFamily: "VT323",
    color: "#555",
    fontSize: 16,
    textAlign: "center",
    paddingVertical: 20,
  },
  submitButton: {
    backgroundColor: "#fbbf24",
    borderRadius: 4,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
    borderWidth: 2,
    borderColor: "#fbbf24",
  },
  submitButtonPressed: {
    opacity: 0.8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontFamily: "VT323",
    color: "#0a0a1a",
    fontSize: 22,
    letterSpacing: 2,
  },
});
