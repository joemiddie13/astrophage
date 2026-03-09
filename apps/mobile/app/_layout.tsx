import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/src/lib/auth-client";
import { useAuthGuard } from "@/src/hooks/useAuthGuard";
import { VT323_400Regular } from "@expo-google-fonts/vt323";
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

const convex = new ConvexReactClient(
  process.env.EXPO_PUBLIC_CONVEX_URL as string,
  {
    unsavedChangesWarning: false,
  }
);

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    GeistPixel: require("../assets/fonts/GeistPixel-Square.ttf"),
    VT323: VT323_400Regular,
    SpaceGrotesk: SpaceGrotesk_400Regular,
    "SpaceGrotesk-Bold": SpaceGrotesk_700Bold,
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ConvexProvider client={convex}>
      <ConvexBetterAuthProvider client={convex} authClient={authClient}>
        <RootLayoutNav />
      </ConvexBetterAuthProvider>
    </ConvexProvider>
  );
}

function RootLayoutNav() {
  useAuthGuard();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0a0a1a" },
        headerTintColor: "#00ff88",
        headerTitleStyle: { fontFamily: "VT323", fontSize: 20 },
        contentStyle: { backgroundColor: "#0a0a1a" },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="auth"
        options={{ presentation: "modal", headerShown: false }}
      />
      <Stack.Screen
        name="beacon/[id]"
        options={{ title: "BEACON", presentation: "card", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="beacon/create"
        options={{ title: "NEW BEACON", presentation: "modal" }}
      />
    </Stack>
  );
}
