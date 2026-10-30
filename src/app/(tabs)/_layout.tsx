import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavoColors } from '../../theme/colors';
import { GuideTarget, useGuideControls } from '../../components/guide/GuideTargets';

export default function TabLayout() {
  const colors = useNavoColors();
  const insets = useSafeAreaInsets();
  const guide = useGuideControls();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.muted,
      tabBarHideOnKeyboard: true,
      tabBarStyle: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 70 + insets.bottom,
        paddingHorizontal: 10,
        paddingTop: 6,
        paddingBottom: Math.max(insets.bottom, 6),
        backgroundColor: colors.raised,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: colors.line,
        elevation: 0,
        shadowOpacity: 0,
      },
      tabBarItemStyle: { marginHorizontal: 3, borderRadius: 12, overflow: 'hidden' },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginBottom: 1 },
    }}>
      <Tabs.Screen name="index" options={{
        title: 'Alarms',
        tabBarAccessibilityLabel: 'Destination alarms',
        tabBarButton: (props) => {
          const { children, style, href: _href, ref: _ref, ...buttonProps } = props;
          return <Pressable {...buttonProps} style={style}>{children}</Pressable>;
        },
        tabBarIcon: ({ focused, size }) => <View style={[styles.iconFrame, { backgroundColor: focused ? colors.accentSoft : 'transparent' }]}><Feather name="navigation" color={focused ? colors.accent : colors.muted} size={size} /></View>,
      }} />
      <Tabs.Screen name="routes" options={{
        title: 'Routes',
        tabBarAccessibilityLabel: 'Routes',
        tabBarButton: (props) => {
          const { children, style, href: _href, ref: _ref, ...buttonProps } = props;
          const onPress = buttonProps.onPress;
          return <GuideTarget id="routes-tab" style={styles.buttonTarget}><Pressable {...buttonProps} onPress={(event) => { if (guide.visible) guide.finishGuide(); onPress?.(event); }} style={style}>{children}</Pressable></GuideTarget>;
        },
        tabBarIcon: ({ focused, size }) => <View style={[styles.iconFrame, { backgroundColor: focused ? colors.accentSoft : 'transparent' }]}><Feather name="map" color={focused ? colors.accent : colors.muted} size={size} /></View>,
      }} />
      <Tabs.Screen name="settings" options={{
        title: 'Settings',
        tabBarAccessibilityLabel: 'Settings',
        tabBarButton: (props) => {
          const { children, style, href: _href, ref: _ref, ...buttonProps } = props;
          const onPress = buttonProps.onPress;
          return <GuideTarget id="settings-tab" style={styles.buttonTarget}><Pressable {...buttonProps} onPress={(event) => { if (guide.visible) guide.finishGuide(); onPress?.(event); }} style={style}>{children}</Pressable></GuideTarget>;
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
