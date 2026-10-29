import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavoColors } from '../../theme/colors';
import { GuideTarget } from '../../components/guide/GuideTargets';

export default function TabLayout() {
  const colors = useNavoColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.muted,
      tabBarHideOnKeyboard: true,
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
      tabBarItemStyle: { marginHorizontal: 4, borderRadius: 24, overflow: 'hidden' },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
    }}>
      <Tabs.Screen name="index" options={{
        title: 'Alarms',
        tabBarAccessibilityLabel: 'Destination alarms',
        tabBarButton: (props) => {
          const { children, style, href: _href, ref: _ref, ...buttonProps } = props;
          return <GuideTarget id="alarms-tab" style={styles.buttonTarget}><Pressable {...buttonProps} style={style}>{children}</Pressable></GuideTarget>;
        },
        tabBarIcon: ({ focused, size }) => <View style={[styles.iconFrame, { backgroundColor: focused ? colors.accentSoft : 'transparent' }]}><Feather name="navigation" color={focused ? colors.accent : colors.muted} size={size} /></View>,
      }} />
      <Tabs.Screen name="routes" options={{
        title: 'Routes',
        tabBarAccessibilityLabel: 'Routes',
        tabBarButton: (props) => {
          const { children, style, href: _href, ref: _ref, ...buttonProps } = props;
          return <GuideTarget id="routes-tab" style={styles.buttonTarget}><Pressable {...buttonProps} style={style}>{children}</Pressable></GuideTarget>;
        },
        tabBarIcon: ({ focused, size }) => <View style={[styles.iconFrame, { backgroundColor: focused ? colors.accentSoft : 'transparent' }]}><Feather name="map" color={focused ? colors.accent : colors.muted} size={size} /></View>,
      }} />
      <Tabs.Screen name="settings" options={{
        title: 'Settings',
        tabBarAccessibilityLabel: 'Settings',
        tabBarButton: (props) => {
          const { children, style, href: _href, ref: _ref, ...buttonProps } = props;
          return <GuideTarget id="settings-tab" style={styles.buttonTarget}><Pressable {...buttonProps} style={style}>{children}</Pressable></GuideTarget>;
        },
        tabBarIcon: ({ focused, size }) => <View style={[styles.iconFrame, { backgroundColor: focused ? colors.accentSoft : 'transparent' }]}><Feather name="sliders" color={focused ? colors.accent : colors.muted} size={size} /></View>,
      }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  buttonTarget: { flex: 1 },
  iconFrame: { width: 36, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
});
