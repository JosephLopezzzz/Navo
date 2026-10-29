import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGuideTargets, type GuideTargetId } from './GuideTargets';
import { useNavoColors } from '../../theme/colors';

const steps: { target: GuideTargetId; title: string; detail: string; icon: keyof typeof Feather.glyphMap }[] = [
  { target: 'alarms-tab', title: 'Your destinations', detail: 'Saved stops and their alarm switches live on Alarms.', icon: 'navigation' },
  { target: 'add-alarm', title: 'Add a stop', detail: 'Choose Rail, Bus, or Place. Rail starts with a line and station list.', icon: 'plus' },
  { target: 'routes-tab', title: 'Plan a rail trip', detail: 'Routes lets you choose a line, boarding station, and destination.', icon: 'map' },
  { target: 'settings-tab', title: 'Make it yours', detail: 'Settings includes appearance, permissions, preferences, and this guide.', icon: 'sliders' },
];

export function InAppGuide({ onFinish }: { onFinish: () => void }) {
  const colors = useNavoColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const targets = useGuideTargets();
  const [index, setIndex] = useState(0);
  const step = steps[index]!;
  const bounds = targets[step.target];
  const hasBounds = Boolean(bounds && bounds.width > 0 && bounds.height > 0);
  const cutout = bounds ? { x: bounds.x - 5, y: bounds.y - 5, width: bounds.width + 10, height: bounds.height + 10 } : null;
  const cardHeight = 194;
  const cardWidth = Math.min(screenWidth - 36, 440);
  const cardLeft = (screenWidth - cardWidth) / 2;
  const cardTop = cutout && cutout.y + cutout.height + cardHeight + 24 < screenHeight - insets.bottom
    ? cutout.y + cutout.height + 14
    : insets.top + 18;

  const advance = () => {
    if (index >= steps.length - 1) onFinish();
    else setIndex((current) => current + 1);
  };

  return (
    <View accessibilityViewIsModal style={styles.overlay} pointerEvents="box-none">
      {hasBounds && cutout ? (
        <>
          <Pressable accessibilityElementsHidden onPress={() => undefined} style={[styles.shade, { left: 0, top: 0, right: 0, height: Math.max(0, cutout.y) }]} />
          <Pressable accessibilityElementsHidden onPress={() => undefined} style={[styles.shade, { left: 0, top: cutout.y, width: Math.max(0, cutout.x), height: cutout.height }]} />
          <Pressable accessibilityElementsHidden onPress={() => undefined} style={[styles.shade, { left: cutout.x + cutout.width, top: cutout.y, right: 0, height: cutout.height }]} />
          <Pressable accessibilityElementsHidden onPress={() => undefined} style={[styles.shade, { left: 0, top: cutout.y + cutout.height, right: 0, bottom: 0 }]} />
          <Pressable accessibilityElementsHidden onPress={() => undefined} style={[styles.targetGuard, { left: cutout.x, top: cutout.y, width: cutout.width, height: cutout.height }]} />
          <View pointerEvents="none" style={[styles.cutout, { left: cutout.x, top: cutout.y, width: cutout.width, height: cutout.height, borderColor: colors.aqua }]} />
        </>
      ) : <Pressable accessibilityElementsHidden onPress={() => undefined} style={[styles.shade, StyleSheet.absoluteFill]} />}

      <View accessibilityLabel={`In-app guide, step ${index + 1} of ${steps.length}`} style={[styles.card, { top: cardTop, left: cardLeft, width: cardWidth, backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.cardHeading}>
          <View style={[styles.stepIcon, { backgroundColor: colors.accentSoft }]}><Feather name={step.icon} size={18} color={colors.accent} /></View>
          <View style={styles.headingCopy}>
            <Text style={[styles.progress, { color: colors.accent }]}>{index + 1} of {steps.length}</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{step.title}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Skip guide" onPress={onFinish} hitSlop={8} style={styles.closeButton}>
            <Feather name="x" size={18} color={colors.muted} />
          </Pressable>
        </View>
        <Text style={[styles.detail, { color: colors.muted }]}>{step.detail}</Text>
        {!hasBounds ? <Text style={[styles.hint, { color: colors.quiet }]}>The highlighted control is on the current screen.</Text> : null}
        <View style={styles.footer}>
          <Pressable accessibilityRole="button" onPress={onFinish} style={styles.skipButton}><Text style={[styles.skipText, { color: colors.muted }]}>Skip guide</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={advance} style={[styles.nextButton, { backgroundColor: colors.accent }]}>
            <Text style={[styles.nextText, { color: colors.onAccent }]}>{index === steps.length - 1 ? 'Done' : 'Next'}</Text>
            {index < steps.length - 1 ? <Feather name="arrow-right" size={16} color={colors.onAccent} /> : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 1000 },
  shade: { position: 'absolute', backgroundColor: 'rgba(3, 10, 20, 0.74)' },
  targetGuard: { position: 'absolute' },
  cutout: { position: 'absolute', borderWidth: 2, borderRadius: 15, shadowColor: '#00D3C5', shadowOpacity: 0.38, shadowRadius: 10, elevation: 8 },
  card: { position: 'absolute', maxWidth: 440, alignSelf: 'center', padding: 16, borderWidth: 1, borderRadius: 17, gap: 12, elevation: 12, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headingCopy: { flex: 1, gap: 1 },
  progress: { fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.3 },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.2 },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  detail: { fontSize: 14, lineHeight: 21 },
  hint: { fontSize: 12, lineHeight: 16 },
  footer: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  skipButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 2 },
  skipText: { fontSize: 13, fontWeight: '600' },
  nextButton: { minWidth: 96, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 12 },
  nextText: { fontSize: 14, fontWeight: '700' },
});
