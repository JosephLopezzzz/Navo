import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useNavoColors } from '../../theme/colors';

export default function TabLayout() {
  const colors = useNavoColors();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 62, paddingBottom: 6, paddingTop: 5 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Alarms', tabBarAccessibilityLabel: 'Destination alarms', tabBarIcon: ({ focused, size }) => <Feather name="navigation" color={focused ? colors.accent : colors.muted} size={size} /> }} />
      <Tabs.Screen name="routes" options={{ title: 'Routes', tabBarAccessibilityLabel: 'Routes', tabBarIcon: ({ focused, size }) => <Feather name="map" color={focused ? colors.accent : colors.muted} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarAccessibilityLabel: 'Settings', tabBarIcon: ({ focused, size }) => <Feather name="sliders" color={focused ? colors.accent : colors.muted} size={size} /> }} />
    </Tabs>
  );
}
