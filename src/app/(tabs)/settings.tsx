import { useCallback, useState, type PropsWithChildren } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { NavoPressable as Pressable } from '../../components/NavoPressable';
import { router, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Constants from 'expo-constants';
import { DataSeal, Divider, Screen, ScreenTitle, Subtle } from '../../components/ui';
import { useGuideControls } from '../../components/guide/GuideTargets';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

export default function SettingsScreen() {
  const colors = useNavoColors();
  const app = useAppState();
  const guide = useGuideControls();
  const [statusProblem, setStatusProblem] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    setStatusProblem(null);
  }, []));

  const updateSettings = (patch: Partial<typeof app.settings>) => {
    setStatusProblem(null);
    void app.updateState({ settings: { ...app.settings, ...patch } }).catch(() => {
      setStatusProblem('Navo could not save that setting. Try again.');
    });
  };

  const openLegalPage = () => router.push({ pathname: '/legal/[page]', params: { page: 'all' } });
  const replayGuide = () => {
    router.replace('/(tabs)');
    setTimeout(guide.startGuide, 160);
  };

  const appVersion = Constants.expoConfig?.version ?? 'Unavailable';

  return (
    <Screen tabBar>
      {app.firstRun.preferences.displayName ? <Text style={[styles.greeting, { color: colors.muted }]}>Hi, {app.firstRun.preferences.displayName.trim().split(/\s+/)[0]}</Text> : null}
      <ScreenTitle>Settings</ScreenTitle>

      {app.storageProblem ? (
        <View style={[styles.storageNotice, { backgroundColor: colors.warningSoft }]}>
          <DataSeal label="Saved data unavailable" tone="warning" />
          <Subtle>{app.storageProblem}</Subtle>
          <Pressable accessibilityRole="button" onPress={() => void app.refreshState()} style={[styles.secondaryAction, { borderColor: colors.line }]}>
            <Text style={[styles.secondaryActionText, { color: colors.ink }]}>Retry saved data</Text>
          </Pressable>
        </View>
      ) : null}

      <SettingsGroup title="PERSONALIZE">
        <View style={styles.settingBlock}>
          <View style={styles.rowHeading}>
            <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}><Feather name="moon" size={15} color={colors.accent} /></View>
            <View style={styles.rowCopy}>
              <Text style={[styles.settingTitle, { color: colors.ink }]}>Appearance</Text>
              <Text style={[styles.settingDetail, { color: colors.muted }]}>Arctic Pearl is the default. Obsidian is ready for night.</Text>
            </View>
          </View>
          <View style={[styles.appearanceOptions, { backgroundColor: colors.raised }]}>
            <AppearanceOption label="System" selected={app.settings.appearance === 'system'} onPress={() => updateSettings({ appearance: 'system' })} />
            <AppearanceOption label="Light" selected={app.settings.appearance === 'light'} onPress={() => updateSettings({ appearance: 'light' })} />
            <AppearanceOption label="Dark" selected={app.settings.appearance === 'dark'} onPress={() => updateSettings({ appearance: 'dark' })} />
          </View>
        </View>
        <Divider />
        <SettingLink icon="sliders" title="Your preferences" detail="Name, commute type, and preferred rail line" onPress={() => router.push('/preferences')} />
      </SettingsGroup>

      <SettingsGroup title="ALERTS & LOCATION">
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={[styles.settingTitle, { color: colors.ink }]}>Sleep mode</Text>
            <Text style={[styles.settingDetail, { color: colors.muted }]}>Only alert near your destination.</Text>
          </View>
          <Switch
            accessibilityLabel="Sleep mode, destination only"
            accessibilityHint="Turn off to receive alerts at each upcoming route stop."
            value={app.settings.sleepMode}
            onValueChange={(sleepMode) => updateSettings({ sleepMode })}
            trackColor={{ false: colors.switchOffTrack, true: colors.accent }}
            thumbColor={colors.switchThumb}
          />
        </View>
        <Divider />
        <View style={styles.samplingBlock}>
          <View style={styles.samplingHeading}>
            <Text style={[styles.settingTitle, { color: colors.ink }]}>Location sampling</Text>
            <Text style={[styles.settingDetail, { color: colors.muted }]}>{app.activeTrip?.status === 'active' || app.destinationAlarms.some((alarm) => alarm.enabled) ? 'Next session' : 'Next alarm or trip'}</Text>
          </View>
          <View style={[styles.samplingOptions, { backgroundColor: colors.raised }]}>
            <SamplingOption label="Balanced" detail="20 sec · 75 m" selected={app.settings.updateIntervalMs === 20_000} onPress={() => updateSettings({ updateIntervalMs: 20_000, updateDistanceM: 75 })} />
            <SamplingOption label="Battery saver" detail="30 sec · 150 m" selected={app.settings.updateIntervalMs === 30_000} onPress={() => updateSettings({ updateIntervalMs: 30_000, updateDistanceM: 150 })} />
          </View>
        </View>
      </SettingsGroup>

      <SettingsGroup title="HELP & PERMISSIONS">
        <SettingLink icon="help-circle" title="Replay the app guide" detail="A short tour of alarms, routes, and settings" onPress={replayGuide} />
        <Divider />
        <SettingLink icon="shield" title="Alarm permissions" detail="Location and notification access" onPress={() => router.push('/permissions')} />
        <Divider />
        <SettingLink icon="file-text" title="Privacy & Legal" detail="Privacy, terms, location safety, and map licenses" onPress={openLegalPage} />
      </SettingsGroup>

      <View style={styles.aboutRow}>
        <View style={styles.aboutCopy}><Text style={[styles.aboutName, { color: colors.ink }]}>About Navo</Text><Text style={[styles.aboutDetail, { color: colors.muted }]}>A commute alarm for your next stop.</Text></View>
        <Text style={[styles.version, { color: colors.muted }]}>v{appVersion}</Text>
      </View>
      {statusProblem ? <Text accessibilityRole="alert" style={[styles.problemText, { color: colors.danger }]}>{statusProblem}</Text> : null}
    </Screen>
  );
}

function SettingsGroup({ title, children }: PropsWithChildren<{ title: string }>) {
  const colors = useNavoColors();
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.muted }]}>{title}</Text>
      <View style={[styles.groupCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>{children}</View>
    </View>
  );
}

function SettingLink({ icon, title, detail, onPress }: { icon: keyof typeof Feather.glyphMap; title: string; detail: string; onPress: () => void }) {
  const colors = useNavoColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.settingLink}>
      <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}><Feather name={icon} size={15} color={colors.accent} /></View>
      <View style={styles.rowCopy}>
        <Text style={[styles.settingTitle, { color: colors.ink }]}>{title}</Text>
        <Text style={[styles.settingDetail, { color: colors.muted }]}>{detail}</Text>
      </View>
      <Feather name="chevron-right" size={17} color={colors.quiet} />
    </Pressable>
  );
}

function SamplingOption({ label, detail, selected, onPress }: { label: string; detail: string; selected: boolean; onPress: () => void }) {
  const colors = useNavoColors();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.samplingOption, selected && { backgroundColor: colors.surface }]}>
      <Text style={[styles.samplingLabel, { color: selected ? colors.ink : colors.muted }]}>{label}</Text>
      <Text style={[styles.optionDetail, { color: colors.muted }]}>{detail}</Text>
    </Pressable>
  );
}

function AppearanceOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useNavoColors();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.appearanceOption, selected && { backgroundColor: colors.surface }]}>
      <Text style={[styles.appearanceLabel, { color: selected ? colors.accent : colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 12, fontWeight: '600' },
  storageNotice: { gap: 9, padding: 12, borderRadius: 13 },
  group: { gap: 6 },
  groupTitle: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.45, paddingHorizontal: 2 },
  groupCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, overflow: 'hidden' },
  settingBlock: { gap: 9, paddingVertical: 11 },
  rowHeading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  rowCopy: { flex: 1, gap: 2 },
  settingTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  settingDetail: { fontSize: 10, lineHeight: 14 },
  appearanceOptions: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 11 },
  appearanceOption: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  appearanceLabel: { fontSize: 12, fontWeight: '700' },
  settingLink: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  settingRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  settingCopy: { flex: 1, gap: 3 },
  samplingBlock: { gap: 7, paddingVertical: 11 },
  samplingHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  samplingOptions: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: 11 },
  samplingOption: { flex: 1, minHeight: 50, justifyContent: 'center', gap: 2, paddingHorizontal: 8, borderRadius: 9 },
  samplingLabel: { fontSize: 11, fontWeight: '700' },
  optionDetail: { fontSize: 10 },
  aboutRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  aboutCopy: { gap: 3 },
  aboutName: { fontSize: 13, fontWeight: '700' },
  aboutDetail: { fontSize: 11 },
  version: { fontSize: 11, fontVariant: ['tabular-nums'] },
  secondaryAction: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 11 },
  secondaryActionText: { fontSize: 13, fontWeight: '600' },
  problemText: { fontSize: 13, lineHeight: 19 },
});
