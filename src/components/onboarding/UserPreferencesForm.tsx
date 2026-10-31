import { useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { NavoPressable as Pressable } from '../NavoPressable';
import { PrimaryButton, Screen, Subtle } from '../ui';
import { NavoMark } from '../NavoMark';
import { railLines } from '../../data/routes';
import type { DestinationKind } from '../../domain/models';
import { defaultOnboardingPreferences } from '../../services/storage';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

const uses: { id: 'sleep' | 'focus' | 'both'; title: string; detail: string }[] = [
  { id: 'sleep', title: 'Sleep or rest', detail: 'Wake me near my stop' },
  { id: 'focus', title: 'Stay focused', detail: 'Remind me while I do other things' },
  { id: 'both', title: 'A bit of both', detail: 'Different reminders for different days' },
];
const modes: { id: DestinationKind; title: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: 'rail-station', title: 'Rail', icon: 'navigation' },
  { id: 'bus-dropoff', title: 'Bus', icon: 'truck' },
  { id: 'place', title: 'Place', icon: 'map-pin' },
];

export function UserPreferencesForm({
  title = 'Make your commute yours',
  onDone,
  isFirstRun = true,
}: {
  title?: string;
  onDone: () => void;
  isFirstRun?: boolean;
}) {
  const app = useAppState();
  const colors = useNavoColors();
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState(app.firstRun.preferences.displayName);
  const [useFor, setUseFor] = useState(app.firstRun.preferences.useFor);
  const [preferredMode, setPreferredMode] = useState(app.firstRun.preferences.preferredMode);
  const [preferredRailLineId, setPreferredRailLineId] = useState(app.firstRun.preferences.preferredRailLineId);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');

  const currentPreferences = {
    displayName: displayName.trim().slice(0, 48),
    useFor,
    preferredMode,
    preferredRailLineId,
  };

  const save = async (preferences = currentPreferences) => {
    if (saving || !app.ready) return;
    setSaving(true);
    setProblem('');
    try {
      await app.updateState({ firstRun: {
        ...app.firstRun,
        onboardingComplete: true,
        preferences,
      } });
      onDone();
    } catch {
      setProblem('Navo could not save your preferences on this device. Try again.');
      setSaving(false);
    }
  };

  const footer = (
    <>
      {problem ? <Text accessibilityRole="alert" style={[styles.problem, { color: colors.danger }]}>{problem}</Text> : null}
      <PrimaryButton
        title={saving ? 'Saving…' : step === 1 ? 'Continue' : isFirstRun ? 'Finish setup' : 'Save preferences'}
        onPress={() => step === 1 ? setStep(2) : void save()}
        disabled={saving || !app.ready}
      />
      {step === 1 ? (
        isFirstRun ? (
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save(defaultOnboardingPreferences)} style={styles.secondaryAction}>
            <Text style={[styles.secondaryText, { color: colors.muted }]}>Skip setup</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" disabled={saving} onPress={onDone} style={styles.secondaryAction}>
            <Text style={[styles.secondaryText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
        )
      ) : (
        <View style={styles.footerSecondaryRow}>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => setStep(1)} style={styles.backAction}>
            <Feather name="arrow-left" size={15} color={colors.muted} />
            <Text style={[styles.secondaryText, { color: colors.muted }]}>Back</Text>
          </Pressable>
          {isFirstRun ? (
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save({
              ...currentPreferences,
              preferredMode: app.firstRun.preferences.preferredMode,
              preferredRailLineId: app.firstRun.preferences.preferredRailLineId,
            })} style={styles.skipAction}>
              <Text style={[styles.secondaryText, { color: colors.muted }]}>Skip for now</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </>
  );

  return (
    <Screen footer={footer}>
      <View style={styles.form}>
      {step === 1 ? (
        <>
          <View style={styles.brandRow}>
            <View style={styles.brandName}><NavoMark size={30} /><Text style={[styles.wordmark, { color: colors.ink }]}>Navo</Text></View>
            <Text style={[styles.stepCount, { color: colors.muted }]}>1 of 2</Text>
          </View>
          <View accessibilityLabel="Step 1 of 2" style={styles.progressRow}>
            <View style={[styles.progressSegment, { backgroundColor: colors.accent }]} />
            <View style={[styles.progressSegment, { backgroundColor: colors.line }]} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>A LITTLE ABOUT YOU</Text>
          <View style={styles.intro}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{title}</Text>
            <Subtle>Set up your reminders in two quick steps.</Subtle>
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.ink }]}>Name <Text style={[styles.optional, { color: colors.muted }]}>(optional)</Text></Text>
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
            <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>How will you use Navo?</Text>
            <View style={styles.choiceList}>
              {uses.map((option) => <ChoiceRow key={option.id} title={option.title} detail={option.detail} selected={useFor === option.id} onPress={() => setUseFor(option.id)} />)}
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={styles.secondHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to personal details" onPress={() => setStep(1)} style={styles.headerBack}>
              <Feather name="arrow-left" size={19} color={colors.ink} />
            </Pressable>
            <Text style={[styles.secondHeaderTitle, { color: colors.ink }]}>Your preferences</Text>
            <Text style={[styles.stepCount, { color: colors.muted }]}>2 of 2</Text>
          </View>
          <View accessibilityLabel="Step 2 of 2" style={styles.progressRow}>
            <View style={[styles.progressSegment, { backgroundColor: colors.accent }]} />
            <View style={[styles.progressSegment, { backgroundColor: colors.accent }]} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>LESS SEARCHING, MORE GOING</Text>
          <View style={styles.intro}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Your usual stops</Text>
            <Subtle>Put your favorite stops first. Change this anytime in Settings.</Subtle>
          </View>

          <View style={styles.section}>
            <View style={styles.modeRow}>
              {modes.map((mode) => {
                const selected = preferredMode === mode.id;
                return (
                  <Pressable key={mode.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setPreferredMode(mode.id)} style={[styles.modeOption, { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.line }]}>
                    <Feather name={mode.icon} size={18} color={selected ? colors.accent : colors.muted} />
                    <Text style={[styles.modeText, { color: selected ? colors.accent : colors.ink }]}>{mode.title}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {preferredMode === 'rail-station' ? (
            <View style={styles.section}>
              <Text accessibilityRole="header" style={[styles.label, { color: colors.ink }]}>Preferred rail line</Text>
              <View style={styles.lineList}>
                {railLines.map((line) => {
                  const selected = preferredRailLineId === line.id;
                  return (
                    <Pressable key={line.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setPreferredRailLineId(line.id)} style={[styles.lineOption, { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.line }]}>
                      <View style={styles.lineCopy}>
                        <Text style={[styles.lineName, { color: colors.ink }]}>{line.name}</Text>
                        <Text style={[styles.lineDetail, { color: colors.muted }]}>Put these stations first</Text>
                      </View>
                      {selected ? <Feather name="check-circle" size={18} color={colors.accent} /> : <View style={[styles.lineRadio, { borderColor: colors.quiet }]} />}
                    </Pressable>
                  );
                })}
              </View>
              <Subtle style={styles.optionalHint}>Optional · You can change this anytime.</Subtle>
            </View>
          ) : (
            <Subtle style={styles.optionalHint}>Optional · Change this anytime in Settings.</Subtle>
          )}
        </>
      )}
      </View>
    </Screen>
  );
}

function ChoiceRow({ title, detail, selected, onPress }: { title: string; detail: string; selected: boolean; onPress: () => void }) {
  const colors = useNavoColors();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.useOption, { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.line }]}>
      <View style={styles.useCopy}><Text style={[styles.useTitle, { color: colors.ink }]}>{title}</Text><Text style={[styles.useDetail, { color: colors.muted }]}>{detail}</Text></View>
      <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.quiet }]}>{selected ? <View style={[styles.radioDot, { backgroundColor: colors.accent }]} /> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14, paddingBottom: 8 },
  brandRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  stepCount: { fontSize: 12, fontWeight: '600' },
  progressRow: { height: 4, flexDirection: 'row', gap: 6 },
  progressSegment: { flex: 1, borderRadius: 3 },
  eyebrow: { marginTop: 2, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.45 },
  intro: { gap: 5, marginTop: -8 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: '700', letterSpacing: -0.55 },
  section: { gap: 9 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  optional: { fontSize: 12, fontWeight: '500' },
  nameInput: { minHeight: 52, paddingHorizontal: 13, borderWidth: 1, borderRadius: 12, fontSize: 15 },
  choiceList: { gap: 8 },
  useOption: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 13, borderWidth: 1, borderRadius: 14 },
  useCopy: { flex: 1, gap: 2 },
  useTitle: { fontSize: 14, fontWeight: '700' },
  useDetail: { fontSize: 12 },
  radio: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1.5 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  secondHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerBack: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  secondHeaderTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeOption: { flex: 1, minHeight: 74, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 13 },
  modeText: { fontSize: 13, fontWeight: '700' },
  lineList: { gap: 8 },
  lineOption: { minHeight: 59, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: 13 },
  lineCopy: { flex: 1, gap: 2 },
  lineName: { fontSize: 13, fontWeight: '700' },
  lineDetail: { fontSize: 11 },
  lineRadio: { width: 18, height: 18, borderWidth: 1.5, borderRadius: 9 },
  optionalHint: { fontSize: 11, lineHeight: 16 },
  problem: { fontSize: 13, lineHeight: 18 },
  secondaryAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 13, fontWeight: '600' },
  footerSecondaryRow: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backAction: { minWidth: 72, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 },
  skipAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
});
