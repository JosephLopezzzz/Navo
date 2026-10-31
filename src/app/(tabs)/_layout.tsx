import { Tabs } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { NavoPressable as Pressable } from '../../components/NavoPressable';
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
        tabBarIcon: ({ focused, size }) => <View style={[styles.iconFrame, { backgroundColor: focused ? colors.accentSoft : 'transparent' }]}><Feather name="clock" color={focused ? colors.accent : colors.muted} size={size} /></View>,
      }} />
      <Tabs.Screen name="routes" options={{
        title: 'Routes',
        tabBarAccessibilityLabel: 'Routes',
        tabBarButton: (props) => {
          const { children, style, href: _href, ref: _ref, ...buttonProps } = props;
          const onPress = buttonProps.onPress;
          return <GuideTarget id="routes-tab" style={styles.buttonTarget}><Pressable {...buttonProps} onPress={(event) => { if (guide.visible) guide.finishGuide(); onPress?.(event); }} style={style}>{children}</Pressable></GuideTarget>;
        },
        tabBarIcon: ({ focused, size }) => (
          <View style={[styles.iconFrame, { backgroundColor: focused ? colors.accentSoft : 'transparent' }]}>
            <RoutePathIcon color={focused ? colors.accent : colors.muted} surface={focused ? colors.accentSoft : colors.raised} size={size} />
          </View>
        ),
      }} />
      <Tabs.Screen name="settings" options={{
        title: 'Settings',
        tabBarAccessibilityLabel: 'Settings',
        tabBarButton: (props) => {
          const { children, style, href: _href, ref: _ref, ...buttonProps } = props;
          const onPress = buttonProps.onPress;
          return <GuideTarget id="settings-tab" style={styles.buttonTarget}><Pressable {...buttonProps} onPress={(event) => { if (guide.visible) guide.finishGuide(); onPress?.(event); }} style={style}>{children}</Pressable></GuideTarget>;
        },
        tabBarIcon: ({ focused, size }) => <View style={[styles.iconFrame, { backgroundColor: focused ? colors.accentSoft : 'transparent' }]}><Feather name="settings" color={focused ? colors.accent : colors.muted} size={size} /></View>,
      }} />
    </Tabs>
  );
}

function RoutePathIcon({ color, surface, size }: { color: string; surface: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessible={false}>
      <Path d="M8.8 4H19a6 6 0 0 1 0 12H11a6 6 0 0 0 0 12h7.5M14.5 24.5 18.5 28l-4 3.5" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={5.5} cy={4} r={3.3} fill={surface} stroke={color} strokeWidth={2.8} />
      <Circle cx={25.5} cy={28} r={3.3} fill={surface} stroke={color} strokeWidth={2.8} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  buttonTarget: { flex: 1 },
  iconFrame: { width: 36, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
});
