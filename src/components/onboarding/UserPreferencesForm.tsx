import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton, ScreenTitle, Subtle } from '../ui';
import { railLines } from '../../data/routes';
import type { DestinationKind } from '../../domain/models';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

const uses: { id: 'sleep' | 'focus' | 'both'; title: string; detail: string }[] = [
  { id: 'sleep', title: 'Sleep or rest', detail: 'Wake near my stop' },
  { id: 'focus', title: 'Stay focused', detail: 'Remind me while I do other things' },
  { id: 'both', title: 'A bit of both', detail: 'I use Navo in different ways' },
];
const modes: { id: DestinationKind; title: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: 'rail-station', title: 'Rail', icon: 'navigation' },
  { id: 'bus-dropoff', title: 'Bus', icon: 'truck' },
  { id: 'place', title: 'Places', icon: 'map-pin' },
];

export function UserPreferencesForm({ title = 'Make Navo yours', onDone }: { title?: string; onDone: () => void }) {
  const app = useAppState();
  const colors = useNavoColors();
  const [displayName, setDisplayName] = useState(app.firstRun.preferences.displayName);
  const [useFor, setUseFor] = useState(app.firstRun.preferences.useFor);
  const [preferredMode, setPreferredMode] = useState(app.firstRun.preferences.preferredMode);
  const [preferredRailLineId, setPreferredRailLineId] = useState(app.firstRun.preferences.preferredRailLineId);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');

  const save = async (skip = false) => {
    if (saving) return;
    setSaving(true);
    setProblem('');
    try {
      await app.updateState({ firstRun: {
        ...app.firstRun,
        onboardingComplete: true,
        preferences: skip ? app.firstRun.preferences : {
          displayName: displayName.trim().slice(0, 48),
          useFor,
          preferredMode,
          preferredRailLineId,
        },
      } });
      onDone();
    } catch {
      setProblem('Navo could not save your preferences on this device. Try again.');
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.intro}>
        <ScreenTitle>{title}</ScreenTitle>
        <Subtle>Your choices stay on this device. A name is optional; your travel mode and rail line help put relevant stops first.</Subtle>
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.ink }]}>What should we call you? <Text style={[styles.optional, { color: colors.muted }]}>Optional</Text></Text>
        <TextInput
          accessibilityLabel="Name, optional"
          autoCapitalize="words"
          maxLength={48}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={colors.quiet}
          returnKeyType="done"
          value={displayName}
          style={[styles.nameInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.ink }]}
        />
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>What do you use Navo for?</Text>
        <View style={styles.choiceList}>
          {uses.map((option) => <ChoiceRow key={option.id} title={option.title} detail={option.detail} selected={useFor === option.id} onPress={() => setUseFor(option.id)} />)}
        </View>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>What do you ride most?</Text>
        <View style={styles.modeRow}>
          {modes.map((mode) => {
            const selected = preferredMode === mode.id;
            return (
              <Pressable key={mode.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setPreferredMode(mode.id)} style={[styles.modeOption, { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.line }]}>
                <Feather name={mode.icon} size={17} color={selected ? colors.accent : colors.muted} />
                <Text style={[styles.modeText, { color: selected ? colors.accent : colors.ink }]}>{mode.title}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {preferredMode === 'rail-station' ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>Preferred line</Text>
          <Subtle>Its station list will be ready when you add an alarm.</Subtle>
          <View style={styles.lineList}>
            {railLines.map((line) => {
              const selected = preferredRailLineId === line.id;
              return (
                <Pressable key={line.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setPreferredRailLineId(line.id)} style={[styles.lineOption, { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.line }]}>
                  <Text style={[styles.lineName, { color: selected ? colors.accent : colors.ink }]}>{line.name}</Text>
                  <Text style={[styles.lineDirection, { color: colors.muted }]}>{line.direction}</Text>
                  {selected ? <Feather name="check-circle" size={17} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {problem ? <Text accessibilityRole="alert" style={[styles.problem, { color: colors.danger }]}>{problem}</Text> : null}
      <PrimaryButton title={saving ? 'Saving…' : 'Continue'} onPress={() => void save()} disabled={saving || !app.ready} />
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save(true)} style={styles.skipButton}>
        <Text style={[styles.skipText, { color: colors.muted }]}>Skip setup</Text>
      </Pressable>
    </View>
  );
}

function ChoiceRow({ title, detail, selected, onPress }: { title: string; detail: string; selected: boolean; onPress: () => void }) {
  const colors = useNavoColors();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.useOption, { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.line }]}>
      <View style={styles.useCopy}><Text style={[styles.useTitle, { color: selected ? colors.accent : colors.ink }]}>{title}</Text><Text style={[styles.useDetail, { color: colors.muted }]}>{detail}</Text></View>
      <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.quiet }]}>{selected ? <View style={[styles.radioDot, { backgroundColor: colors.accent }]} /> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: 22, paddingBottom: 18 },
  intro: { gap: 7 },
  section: { gap: 9 },
  label: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  optional: { fontSize: 12, fontWeight: '500' },
  nameInput: { minHeight: 50, paddingHorizontal: 13, borderWidth: 1, borderRadius: 13, fontSize: 15 },
  choiceList: { gap: 7 },
  useOption: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, borderWidth: 1, borderRadius: 13 },
  useCopy: { flex: 1, gap: 2 },
  useTitle: { fontSize: 14, fontWeight: '600' },
  useDetail: { fontSize: 12 },
  radio: { width: 19, height: 19, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1.5 },
  radioDot: { width: 9, height: 9, borderRadius: 5 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeOption: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 13 },
  modeText: { fontSize: 13, fontWeight: '700' },
  lineList: { gap: 7 },
  lineOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderWidth: 1, borderRadius: 12 },
  lineName: { fontSize: 13, fontWeight: '700' },
  lineDirection: { flex: 1, fontSize: 11 },
  problem: { fontSize: 13, lineHeight: 18 },
  skipButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 14, fontWeight: '600' },
});
