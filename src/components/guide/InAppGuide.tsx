import { useMemo, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable as NativePressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent, type ViewInstance } from 'react-native';
import { NavoPressable as Pressable } from '../NavoPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGuideControls, useGuideTargets, type GuideTargetId } from './GuideTargets';
import { useNavoColors } from '../../theme/colors';

const steps: { target: GuideTargetId; title: string; detail: string; icon: keyof typeof Feather.glyphMap }[] = [
  { target: 'saved-alarms', title: 'Your saved alarms', detail: 'Turn an alarm on when you travel. Your stops stay saved when it’s off.', icon: 'bell' },
  { target: 'add-alarm', title: 'Add a new alarm', detail: 'Choose a rail station, bus stop, or place. You can save more than one.', icon: 'plus' },
  { target: 'routes-tab', title: 'Plan a rail trip', detail: 'Open Routes to choose your line, boarding station, and destination.', icon: 'map' },
  { target: 'settings-tab', title: 'Help is always here', detail: 'Change preferences or replay this guide from Settings → Help.', icon: 'help-circle' },
];

export function InAppGuide() {
  const colors = useNavoColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const targets = useGuideTargets();
  const { visible, step: index, setStep, finishGuide, measureOverlay, overlayBounds } = useGuideControls();
  const overlayRef = useRef<ViewInstance>(null);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const step = steps[index]!;
  const bounds = targets[step.target] ?? null;
  const frame = overlayBounds ?? { x: 0, y: 0, width: screenWidth, height: screenHeight };
  const targetLocal = useMemo(() => bounds ? ({
    x: bounds.x - frame.x,
    y: bounds.y - frame.y,
    width: bounds.width,
    height: bounds.height,
  }) : null, [bounds, frame.x, frame.y]);
  const cutout = useMemo(() => {
    if (!targetLocal) return null;
    const x = Math.max(4, targetLocal.x - 5);
    const y = Math.max(4, targetLocal.y - 5);
    const right = Math.min(frame.width - 4, targetLocal.x + targetLocal.width + 5);
    const bottom = Math.min(frame.height - 4, targetLocal.y + targetLocal.height + 5);
    if (right <= x || bottom <= y) return null;
    return { x, y, width: right - x, height: bottom - y };
  }, [frame.height, frame.width, targetLocal]);
  const cardWidth = Math.min(Math.max(0, frame.width - 32), 420);
  const cardHeight = cardSize.height || 224;
  const cardLeft = Math.max(16, (frame.width - cardWidth) / 2);
  const safeTop = Math.max(12, insets.top - frame.y + 8);
  const safeBottom = frame.height - Math.max(12, screenHeight - insets.bottom - (frame.y + frame.height)) - 12;
  const placement = useMemo(() => {
    if (!cutout) return { top: Math.min(safeTop, Math.max(0, safeBottom - cardHeight)), above: false };
    const belowTop = cutout.y + cutout.height + 14;
    const aboveTop = cutout.y - cardHeight - 14;
    if (belowTop + cardHeight <= safeBottom) return { top: belowTop, above: false };
    if (aboveTop >= safeTop) return { top: aboveTop, above: true };
    const belowRoom = safeBottom - belowTop;
    const aboveRoom = cutout.y - 14 - safeTop;
    const above = aboveRoom > belowRoom;
    return {
      top: above
        ? Math.max(safeTop, Math.min(aboveTop, safeBottom - cardHeight))
        : Math.max(safeTop, Math.min(belowTop, safeBottom - cardHeight)),
      above,
    };
  }, [cardHeight, cutout, safeBottom, safeTop]);
  const pointerLeft = cutout ? Math.max(16, Math.min(cardWidth - 28, cutout.x + cutout.width / 2 - cardLeft - 6)) : cardWidth / 2 - 6;

  const measureCard = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout;
    setCardSize((current) => Math.abs(current.width - next.width) < 1 && Math.abs(current.height - next.height) < 1
      ? current
      : { width: next.width, height: next.height });
  };

  const advance = () => {
    if (index >= steps.length - 1) finishGuide();
    else setStep(index + 1);
  };

  if (!visible) return null;

  return (
    <View
      ref={overlayRef}
      accessibilityViewIsModal
      onLayout={() => measureOverlay(overlayRef.current)}
      pointerEvents="box-none"
      style={styles.overlay}
    >
      {cutout ? (
        <>
          <NativePressable accessibilityElementsHidden onPress={() => undefined} style={[styles.shade, { left: 0, top: 0, right: 0, height: Math.max(0, cutout.y) }]} />
          <NativePressable accessibilityElementsHidden onPress={() => undefined} style={[styles.shade, { left: 0, top: cutout.y, width: Math.max(0, cutout.x), height: cutout.height }]} />
          <NativePressable accessibilityElementsHidden onPress={() => undefined} style={[styles.shade, { left: cutout.x + cutout.width, top: cutout.y, right: 0, height: cutout.height }]} />
          <NativePressable accessibilityElementsHidden onPress={() => undefined} style={[styles.shade, { left: 0, top: cutout.y + cutout.height, right: 0, bottom: 0 }]} />
          <View pointerEvents="none" style={[styles.cutout, { left: cutout.x, top: cutout.y, width: cutout.width, height: cutout.height, borderColor: colors.aqua }]} />
        </>
      ) : <NativePressable accessibilityElementsHidden onPress={() => undefined} style={[styles.shade, StyleSheet.absoluteFill]} />}

      <View
        accessibilityLabel={`In-app guide, step ${index + 1} of ${steps.length}`}
        onLayout={measureCard}
        style={[styles.card, { top: placement.top, left: cardLeft, width: cardWidth, backgroundColor: colors.surface, borderColor: colors.line }]}
      >
        {cutout ? <View pointerEvents="none" style={[styles.pointer, placement.above ? styles.pointerBelow : styles.pointerAbove, { left: pointerLeft, backgroundColor: colors.surface, borderColor: colors.line }]} /> : null}
        <View style={styles.cardHeading}>
          <View style={[styles.stepIcon, { backgroundColor: colors.accentSoft }]}><Feather name={step.icon} size={18} color={colors.accent} /></View>
          <View style={styles.headingCopy}>
            <Text style={[styles.progress, { color: colors.accent }]}>{index + 1} OF {steps.length}</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{step.title}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Skip guide" onPress={finishGuide} hitSlop={8} style={styles.skipTop}>
            <Text style={[styles.skipText, { color: colors.muted }]}>Skip</Text>
          </Pressable>
        </View>
        <Text style={[styles.detail, { color: colors.muted }]}>{step.detail}</Text>
        {!cutout ? <Text style={[styles.hint, { color: colors.quiet }]}>The highlighted control is on the current screen.</Text> : null}
        <View style={styles.footer}>
          {index > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => setStep(Math.max(0, index - 1))} style={styles.backButton}>
              <Text style={[styles.skipText, { color: colors.muted }]}>Back</Text>
            </Pressable>
          ) : <View style={styles.backButton} />}
          <Pressable accessibilityRole="button" onPress={advance} style={[styles.nextButton, { backgroundColor: colors.accent }]}>
            <Text style={[styles.nextText, { color: colors.onAccent }]}>{index === steps.length - 1 ? 'Finish guide' : 'Next'}</Text>
            {index < steps.length - 1 ? <Feather name="arrow-right" size={16} color={colors.onAccent} /> : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 1000 },
  shade: { position: 'absolute', backgroundColor: 'rgba(3, 10, 20, 0.72)' },
  cutout: { position: 'absolute', borderWidth: 2, borderRadius: 13, shadowColor: '#00D3C5', shadowOpacity: 0.45, shadowRadius: 9, elevation: 8 },
  card: { position: 'absolute', maxWidth: 420, padding: 14, borderWidth: 1, borderRadius: 14, gap: 10, elevation: 12, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  pointer: { position: 'absolute', zIndex: 2, width: 12, height: 12, borderWidth: 1, transform: [{ rotate: '45deg' }] },
  pointerAbove: { top: -7, borderRightWidth: 0, borderBottomWidth: 0 },
  pointerBelow: { bottom: -7, borderLeftWidth: 0, borderTopWidth: 0 },
  cardHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 },
  stepIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headingCopy: { flex: 1, gap: 1 },
  progress: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.4 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 },
  skipTop: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  detail: { fontSize: 14, lineHeight: 20 },
  hint: { fontSize: 12, lineHeight: 16 },
  footer: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  backButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  skipText: { fontSize: 13, fontWeight: '600' },
  nextButton: { minWidth: 120, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 12 },
  nextText: { fontSize: 14, fontWeight: '700' },
});
