import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/src/lib/auth-client";

type Mode = "signin" | "signup";

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const createUser = useMutation(api.users.createUser);

  async function handleSignIn() {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.signIn.username({
        username,
        password,
      });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed");
      }
    } catch (e: any) {
      setError(e.message ?? "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp() {
    setError("");
    setLoading(true);
    try {
      const sanitized = username.replace(/[^a-zA-Z0-9]/g, "");
      const placeholderEmail = `${sanitized}@astrophage.local`;

      const result = await authClient.signUp.email({
        email: placeholderEmail,
        password,
        name: displayName || username,
        username,
      });

      if (result.error) {
        setError(result.error.message ?? "Sign up failed");
        return;
      }

      const maxRetries = 5;
      for (let i = 0; i < maxRetries; i++) {
        try {
          await createUser({
            username,
            displayName: displayName || username,
          });
          break;
        } catch {
          if (i < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 500 * (i + 1)));
          }
        }
      }
    } catch (e: any) {
      setError(e.message ?? "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Title area */}
      <View style={styles.titleArea}>
        <Text style={styles.title}>ORBYT</Text>
        <View style={styles.titleDivider} />
        <Text style={styles.tagline}>
          See your people. Make plans.{"\n"}Close the app.
        </Text>
      </View>

      {/* Auth card */}
      <View style={styles.card}>
        {/* Tab switcher */}
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, mode === "signin" && styles.tabActive]}
            onPress={() => { setMode("signin"); setError(""); }}
          >
            <Text style={[styles.tabText, mode === "signin" && styles.tabTextActive]}>
              SIGN IN
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, mode === "signup" && styles.tabActive]}
            onPress={() => { setMode("signup"); setError(""); }}
          >
            <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>
              SIGN UP
            </Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.inputLabel}>USERNAME</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter username"
          placeholderTextColor="#555"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {mode === "signup" && (
          <>
            <Text style={styles.inputLabel}>DISPLAY NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="Display name (optional)"
              placeholderTextColor="#555"
              value={displayName}
              onChangeText={setDisplayName}
            />
          </>
        )}

        <Text style={styles.inputLabel}>PASSWORD</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter password"
          placeholderTextColor="#555"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={mode === "signin" ? handleSignIn : handleSignUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0a0a1a" />
          ) : (
            <Text style={styles.buttonText}>CONNECT</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.footer}>
        NO ADS. NO ALGORITHM. JUST YOUR PEOPLE.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  titleArea: {
    alignItems: "center",
    marginBottom: 32,
    gap: 12,
  },
  title: {
    fontFamily: "GeistPixel",
    fontSize: 56,
    color: "#00ff88",
    textShadowColor: "rgba(0,255,136,0.3)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  titleDivider: {
    width: 80,
    height: 3,
    backgroundColor: "#00ff88",
    borderRadius: 2,
  },
  tagline: {
    fontFamily: "VT323",
    fontSize: 20,
    color: "#00ff88",
    textAlign: "center",
    lineHeight: 26,
    letterSpacing: 1,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#0d1117",
    borderRadius: 4,
    padding: 24,
    gap: 12,
    borderWidth: 2,
    borderColor: "#1a3a2a",
  },
  tabRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "#1a3a2a",
  },
  tabActive: {
    borderBottomColor: "#00ff88",
  },
  tabText: {
    fontFamily: "VT323",
    fontSize: 18,
    color: "#555",
    letterSpacing: 1,
  },
  tabTextActive: {
    color: "#e8e0d4",
  },
  inputLabel: {
    fontFamily: "VT323",
    fontSize: 16,
    color: "#00ff88",
    letterSpacing: 1,
  },
  error: {
    fontFamily: "VT323",
    color: "#ff3366",
    fontSize: 16,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#0a0a1a",
    borderRadius: 4,
    padding: 14,
    fontFamily: "SpaceGrotesk",
    fontSize: 16,
    color: "#e8e0d4",
    borderWidth: 2,
    borderColor: "#1a3a2a",
  },
  button: {
    backgroundColor: "#00ff88",
    borderRadius: 4,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: "VT323",
    color: "#0a0a1a",
    fontSize: 22,
    letterSpacing: 2,
  },
  footer: {
    fontFamily: "VT323",
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    marginTop: 32,
    letterSpacing: 1,
  },
});
