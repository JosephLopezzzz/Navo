import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavoColors } from '../../theme/colors';

export default function TabLayout() {
  const colors = useNavoColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.muted,
      tabBarHideOnKeyboard: true,
      tabBarActiveBackgroundColor: colors.accentSoft,
      tabBarStyle: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: Math.max(12, insets.bottom + 10),
        height: 64,
        paddingHorizontal: 7,
        paddingVertical: 7,
        backgroundColor: colors.surface,
        borderTopWidth: 0,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 32,
        elevation: 8,
        shadowColor: colors.midnight,
        shadowOpacity: 0.12,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
      },
      tabBarItemStyle: { marginHorizontal: 4, borderRadius: 24 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Alarms', tabBarAccessibilityLabel: 'Destination alarms', tabBarIcon: ({ focused, size }) => <Feather name="navigation" color={focused ? colors.accent : colors.muted} size={size} /> }} />
      <Tabs.Screen name="routes" options={{ title: 'Routes', tabBarAccessibilityLabel: 'Routes', tabBarIcon: ({ focused, size }) => <Feather name="map" color={focused ? colors.accent : colors.muted} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarAccessibilityLabel: 'Settings', tabBarIcon: ({ focused, size }) => <Feather name="sliders" color={focused ? colors.accent : colors.muted} size={size} /> }} />
    </Tabs>
  );
}
