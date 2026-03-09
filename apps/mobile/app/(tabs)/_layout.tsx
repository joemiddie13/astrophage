import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#00ff88",
        tabBarInactiveTintColor: "#555",
        tabBarStyle: {
          backgroundColor: "#0a0a1a",
          borderTopColor: "#1a3a2a",
          borderTopWidth: 2,
        },
        tabBarLabelStyle: {
          fontFamily: "VT323",
          fontSize: 14,
          letterSpacing: 1,
        },
        headerStyle: { backgroundColor: "#0a0a1a" },
        headerTintColor: "#00ff88",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "BEACONS",
          tabBarIcon: ({ color }) => <TabBarIcon name="bolt" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "PROFILE",
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
