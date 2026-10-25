import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavoColors, spacing } from '../theme/colors';

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const colors = useNavoColors();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : <View style={styles.content}>{children}</View>}
    </SafeAreaView>
  );
}

export function Body({ children, color, style, ...props }: PropsWithChildren<{ color?: string; style?: object; accessibilityLabel?: string }>) {
  const colors = useNavoColors();
  return <Text {...props} style={[styles.body, { color: color ?? colors.ink }, style]}>{children}</Text>;
}

export function Subtle({ children, style }: PropsWithChildren<{ style?: object }>) {
  const colors = useNavoColors();
  return <Text style={[styles.subtle, { color: colors.muted }, style]}>{children}</Text>;
}

export function ScreenTitle({ children }: PropsWithChildren) {
  const colors = useNavoColors();
  return <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{children}</Text>;
}

export function SectionTitle({ children, accessory }: { children: ReactNode; accessory?: ReactNode }) {
  const colors = useNavoColors();
  return (
    <View style={styles.sectionTitle}>
      <Text accessibilityRole="header" style={[styles.sectionText, { color: colors.ink }]}>{children}</Text>
      {accessory}
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled, accessibilityLabel }: { title: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  const colors = useNavoColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, { backgroundColor: disabled ? colors.line : colors.accent, opacity: pressed ? 0.82 : 1 }]}
    >
      <Text style={[styles.primaryText, { color: disabled ? colors.quiet : colors.onAccent }]}>{title}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress, disabled, accessibilityLabel }: { title: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  const colors = useNavoColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.line, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.secondaryText, { color: colors.ink }]}>{title}</Text>
    </Pressable>
  );
}

export function DataSeal({ label, tone = 'warning' }: { label: string; tone?: 'warning' | 'success' | 'neutral' }) {
  const colors = useNavoColors();
  const foreground = tone === 'success' ? colors.success : tone === 'neutral' ? colors.muted : colors.warning;
  const background = tone === 'success' ? colors.successSoft : tone === 'neutral' ? colors.raised : colors.warningSoft;
  return (
    <View accessibilityRole="text" style={[styles.seal, { borderColor: foreground, backgroundColor: background }]}>
      <View style={[styles.sealDot, { backgroundColor: foreground }]} />
      <Text style={[styles.sealText, { color: foreground }]}>{label}</Text>
    </View>
  );
}

export function Divider() {
  const colors = useNavoColors();
  return <View style={[styles.divider, { backgroundColor: colors.line }]} />;
}

export function RouteLine({ passed = 0, total, destinationLabel }: { passed?: number; total: number; destinationLabel?: string }) {
  const colors = useNavoColors();
  const count = Math.max(total - 1, 1);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: count, now: Math.min(passed, count) }} accessibilityLabel={destinationLabel ? `Route progress to ${destinationLabel}` : 'Route progress'} style={styles.routeLineWrap}>
      <View style={styles.routeTrack}>
        <View style={[styles.routeFill, { width: `${Math.max(0, Math.min(100, (passed / count) * 100))}%`, backgroundColor: colors.accent }]} />
        {Array.from({ length: total }, (_, index) => (
          <View key={index} style={[styles.routeDot, { left: `${(index / count) * 100}%`, backgroundColor: index <= passed ? colors.accent : colors.surface, borderColor: index <= passed ? colors.accent : colors.quiet }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 40, gap: spacing.lg, flexGrow: 1 },
  body: { fontSize: 16, lineHeight: 23 },
  subtle: { fontSize: 14, lineHeight: 20 },
  title: { fontSize: 32, fontWeight: '700', letterSpacing: -0.8, lineHeight: 38 },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  sectionText: { fontSize: 19, fontWeight: '600', letterSpacing: -0.25 },
  primaryButton: { minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  primaryText: { fontSize: 16, fontWeight: '700' },
  secondaryButton: { minHeight: 50, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  seal: { minHeight: 28, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 7, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  sealDot: { width: 6, height: 6, borderRadius: 3 },
  sealText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.45, textTransform: 'uppercase' },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  routeLineWrap: { paddingVertical: 9, paddingHorizontal: 4 },
  routeTrack: { height: 3, backgroundColor: '#A8B7B2', position: 'relative', justifyContent: 'center' },
  routeFill: { height: 3, position: 'absolute', left: 0, top: 0 },
  routeDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, position: 'absolute', marginLeft: -5, top: -3.5 },
});
