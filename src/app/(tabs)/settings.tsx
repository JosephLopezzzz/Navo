import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { DataSeal, Divider, Screen, ScreenTitle, Subtle } from '../../components/ui';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

type PermissionState = 'checking' | 'allowed' | 'approximate' | 'off';
interface PermissionSummary { notifications: PermissionState; foreground: PermissionState; precise: PermissionState; background: PermissionState }
async function readPermissionSummary(): Promise<PermissionSummary> {
  const [notifications, foreground, background] = await Promise.all([
    Notifications.getPermissionsAsync(), Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync(),
  ]);
  const precision = foreground.android?.accuracy === 'fine' || foreground.ios?.accuracy === 'full'
    ? 'allowed'
    : 'approximate';
  return {
    notifications: notifications.granted ? 'allowed' : 'off',
    foreground: foreground.granted ? 'allowed' : 'off',
    precise: foreground.granted ? precision : 'off',
    background: background.granted ? 'allowed' : 'off',
  };
}

export default function SettingsScreen() {
  const colors = useNavoColors();
  const app = useAppState();
  const [permissions, setPermissions] = useState<PermissionSummary | null>(null);
  const [statusProblem, setStatusProblem] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshPermissions = useCallback(async () => {
    setRefreshing(true);
    setStatusProblem(null);
    try {
      setPermissions(await readPermissionSummary());
    } catch {
      setStatusProblem('Permission status could not be read. Check your phone settings.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refreshPermissions();
  }, [refreshPermissions]));

  const updateSettings = (patch: Partial<typeof app.settings>) => {
    setStatusProblem(null);
    void app.updateState({ settings: { ...app.settings, ...patch } }).catch(() => {
      setStatusProblem('Navo could not save that setting. Try again.');
    });
  };

  const openSystemSettings = () => {
    setStatusProblem(null);
    void Linking.openSettings().catch(() => setStatusProblem('Phone settings could not be opened.'));
  };

  const openLegalPage = (page: 'privacy' | 'terms' | 'location-safety' | 'map-data') => {
    router.push({ pathname: '/legal/[page]', params: { page } });
  };

  const locationWorkActive = Boolean(app.activeTrip?.status === 'active' || app.destinationAlarms.some((alarm) => alarm.enabled));
  const appVersion = Constants.expoConfig?.version ?? 'Unavailable';

  return (
    <Screen tabBar>
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.accentSoft }]}>
          <Feather name="sliders" size={18} color={colors.accent} />
        </View>
        <ScreenTitle>Settings</ScreenTitle>
      </View>

      {app.storageProblem && (
        <View style={[styles.storageNotice, { backgroundColor: colors.warningSoft }]}>
          <DataSeal label="Saved data unavailable" tone="warning" />
          <Subtle>{app.storageProblem}</Subtle>
          <Pressable accessibilityRole="button" onPress={() => void app.refreshState()} style={[styles.secondaryAction, { borderColor: colors.line }]}>
            <Text style={[styles.secondaryActionText, { color: colors.ink }]}>Retry saved data</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.section}>
        <SectionHeading title="Alerts" />
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
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.surface}
          />
        </View>
      </View>

      <Divider />

      <View style={styles.section}>
        <SectionHeading title="Location & permissions" accessory={(
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh permission status" onPress={() => void refreshPermissions()} style={styles.refreshButton}>
            <Feather name={refreshing ? 'loader' : 'refresh-cw'} size={16} color={colors.accent} />
          </Pressable>
        )} />
        <PermissionRow label="Notifications" state={permissions?.notifications ?? 'checking'} />
        <PermissionRow label="Location while using Navo" state={permissions?.foreground ?? 'checking'} />
        <PermissionRow label="Precise location" state={permissions?.precise ?? 'checking'} />
        <PermissionRow label="Background location" state={permissions?.background ?? 'checking'} />
        <Pressable accessibilityRole="button" onPress={openSystemSettings} style={[styles.permissionAction, { borderColor: colors.line }]}>
          <Feather name="settings" size={16} color={colors.accent} />
          <Text style={[styles.permissionActionText, { color: colors.ink }]}>Manage permissions</Text>
          <Feather name="external-link" size={15} color={colors.muted} />
        </Pressable>

        <View style={styles.samplingBlock}>
          <View style={styles.samplingHeading}>
            <Text style={[styles.settingTitle, { color: colors.ink }]}>Location sampling</Text>
            <Text style={[styles.settingDetail, { color: colors.muted }]}>{locationWorkActive ? 'Next session' : 'Next alarm or trip'}</Text>
          </View>
          <View style={[styles.samplingOptions, { backgroundColor: colors.raised }]}>
            <SamplingOption
              label="Balanced"
              detail="20 sec · 75 m"
              selected={app.settings.updateIntervalMs === 20_000}
              onPress={() => updateSettings({ updateIntervalMs: 20_000, updateDistanceM: 75 })}
            />
            <SamplingOption
              label="Battery saver"
              detail="30 sec · 150 m"
              selected={app.settings.updateIntervalMs === 30_000}
              onPress={() => updateSettings({ updateIntervalMs: 30_000, updateDistanceM: 150 })}
            />
          </View>
        </View>
      </View>

      <Divider />

      <View style={styles.section}>
        <SectionHeading title="Appearance" />
        <Text style={[styles.sectionNote, { color: colors.muted }]}>Arctic Pearl is the default. Obsidian follows your choice.</Text>
        <View style={[styles.appearanceOptions, { backgroundColor: colors.raised }]}>
          <AppearanceOption label="System" selected={app.settings.appearance === 'system'} onPress={() => updateSettings({ appearance: 'system' })} />
          <AppearanceOption label="Light" selected={app.settings.appearance === 'light'} onPress={() => updateSettings({ appearance: 'light' })} />
          <AppearanceOption label="Dark" selected={app.settings.appearance === 'dark'} onPress={() => updateSettings({ appearance: 'dark' })} />
        </View>
      </View>

      <Divider />

      <View style={styles.section}>
        <SectionHeading title="Privacy & legal" />
        <LegalRow title="Privacy policy" detail="Data stored here and sent to providers" onPress={() => openLegalPage('privacy')} />
        <LegalRow title="Terms of use" onPress={() => openLegalPage('terms')} />
        <LegalRow title="Location & safety" detail="How location alarms can be affected" onPress={() => openLegalPage('location-safety')} />
        <LegalRow title="Map data & licenses" detail="Provider credits and map licenses" onPress={() => openLegalPage('map-data')} />
      </View>

      <Divider />

      <View style={styles.aboutRow}>
        <View style={styles.aboutMark}><Text style={[styles.aboutName, { color: colors.ink }]}>About Navo</Text><Text style={[styles.aboutDetail, { color: colors.muted }]}>A commute alarm for your next stop.</Text></View>
        <Text style={[styles.version, { color: colors.muted }]}>v{appVersion}</Text>
      </View>

      {statusProblem && <Text accessibilityRole="alert" style={[styles.problemText, { color: colors.danger }]}>{statusProblem}</Text>}
    </Screen>
  );
}

function SectionHeading({ title, accessory }: { title: string; accessory?: ReactNode }) {
  const colors = useNavoColors();
  return (
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
      {accessory}
    </View>
  );
}

function PermissionRow({ label, state }: { label: string; state: PermissionState }) {
  const colors = useNavoColors();
  const labelForState = state === 'checking' ? 'Checking' : state === 'allowed' ? 'Allowed' : state === 'approximate' ? 'Approximate' : 'Off';
  const tone = state === 'checking' ? 'neutral' : state === 'allowed' ? 'success' : 'warning';
  return (
    <View style={styles.permissionRow}>
      <Text style={[styles.settingTitle, { color: colors.ink }]}>{label}</Text>
      <DataSeal label={labelForState} tone={tone} />
    </View>
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

function LegalRow({ title, detail, onPress }: { title: string; detail?: string; onPress: () => void }) {
  const colors = useNavoColors();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.legalRow}>
      <View style={styles.legalCopy}>
        <Text style={[styles.settingTitle, { color: colors.ink }]}>{title}</Text>
        {detail && <Text style={[styles.settingDetail, { color: colors.muted }]}>{detail}</Text>}
      </View>
      <Feather name="chevron-right" size={18} color={colors.quiet} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  section: { gap: 10 },
  storageNotice: { gap: 9, padding: 12, borderRadius: 13 },
  sectionHeading: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', letterSpacing: -0.1 },
  sectionNote: { fontSize: 13, lineHeight: 18 },
  settingRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  settingCopy: { flex: 1, gap: 3 },
  settingTitle: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  settingDetail: { fontSize: 12, lineHeight: 17 },
  permissionRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  refreshButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  permissionAction: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, borderWidth: 1, borderRadius: 12 },
  permissionActionText: { flex: 1, fontSize: 13, fontWeight: '600' },
  samplingBlock: { gap: 6, paddingTop: 3 },
  samplingHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  samplingOptions: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: 13 },
  samplingOption: { flex: 1, minHeight: 50, justifyContent: 'center', gap: 2, paddingHorizontal: 8, borderRadius: 10 },
  samplingLabel: { fontSize: 12, fontWeight: '700' },
  optionDetail: { fontSize: 11 },
  appearanceOptions: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 13 },
  appearanceOption: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  appearanceLabel: { fontSize: 13, fontWeight: '700' },
  legalRow: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  legalCopy: { flex: 1, gap: 2 },
  aboutRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  aboutMark: { gap: 3 },
  aboutName: { fontSize: 14, fontWeight: '700' },
  aboutDetail: { fontSize: 12 },
  version: { fontSize: 12, fontVariant: ['tabular-nums'] },
  secondaryAction: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 11 },
  secondaryActionText: { fontSize: 13, fontWeight: '600' },
  problemText: { fontSize: 13, lineHeight: 19 },
});
