import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { AndroidImportance } from 'expo-notifications';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Body, DataSeal, Divider, PrimaryButton, Screen, ScreenTitle, SectionTitle, Subtle } from '../../components/ui';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

interface PermissionSummary { notifications: boolean; foreground: boolean; background: boolean }

async function readPermissionSummary(): Promise<PermissionSummary> {
  const [notifications, foreground, background] = await Promise.all([
    Notifications.getPermissionsAsync(), Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync(),
  ]);
  return { notifications: notifications.granted, foreground: foreground.granted, background: background.granted };
}

export default function SettingsScreen() {
  const colors = useNavoColors();
  const app = useAppState();
  const { settings, updateState } = app;
  const [permissions, setPermissions] = useState<PermissionSummary>({ notifications: false, foreground: false, background: false });
  const [busy, setBusy] = useState(false);

  const refreshPermissions = useCallback(async () => {
    setPermissions(await readPermissionSummary());
  }, []);

  useEffect(() => {
    let mounted = true;
    void readPermissionSummary().then((next) => {
      if (mounted) setPermissions(next);
    });
    return () => { mounted = false; };
  }, []);

  const requestBasics = async () => {
    setBusy(true);
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('navo-trip', { name: 'Navo trip alerts', importance: AndroidImportance.HIGH, vibrationPattern: [0, 250, 120, 250], lightColor: '#0869A8' });
      }
      await Notifications.requestPermissionsAsync();
      await Location.requestForegroundPermissionsAsync();
      await refreshPermissions();
    } catch {
      Alert.alert('Permission check failed', 'You can review Navo permissions in your phone settings.');
    } finally {
      setBusy(false);
    }
  };

  const openSystemSettings = () => { void Linking.openSettings(); };

  return (
    <Screen>
      <ScreenTitle>Settings</ScreenTitle>
      <Subtle>Trip alerts use location only while a trip is active. Sleep mode limits alerts to your destination.</Subtle>

      {app.storageProblem && (
        <View style={styles.settingBlock}>
          <DataSeal label="Local data unavailable" tone="warning" />
          <Subtle>{app.storageProblem}</Subtle>
          <PrimaryButton title="Retry saved data" onPress={() => void app.refreshState()} />
        </View>
      )}

      <View style={styles.settingBlock}>
        <SectionTitle>Appearance</SectionTitle>
        <Subtle>Light is on by default. Choose a darker palette for evening rides.</Subtle>
        <View style={styles.optionRow}>
          <Option label="Light" detail="Arctic Pearl" selected={settings.appearance === 'light'} onPress={() => updateState({ settings: { ...settings, appearance: 'light' } })} />
          <Option label="Dark" detail="Obsidian" selected={settings.appearance === 'dark'} onPress={() => updateState({ settings: { ...settings, appearance: 'dark' } })} />
        </View>
      </View>
      <Divider />

      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Body>Sleep mode</Body>
          <Subtle>Only alert me near the destination.</Subtle>
        </View>
        <Switch accessibilityLabel="Sleep mode, destination alerts only" value={settings.sleepMode} onValueChange={(sleepMode) => updateState({ settings: { ...settings, sleepMode } })} trackColor={{ true: colors.accent }} />
      </View>
      <Divider />

      <View style={styles.settingBlock}>
        <SectionTitle>Location sampling</SectionTitle>
        <Subtle>Balanced checks about every 20 seconds or 75 metres. Your phone may sample less often in the background.</Subtle>
        <View style={styles.optionRow}>
          <Option label="Balanced" detail="20 sec · 75 m" selected={settings.updateIntervalMs === 20_000} onPress={() => updateState({ settings: { ...settings, updateIntervalMs: 20_000, updateDistanceM: 75 } })} />
          <Option label="Battery saver" detail="30 sec · 150 m" selected={settings.updateIntervalMs === 30_000} onPress={() => updateState({ settings: { ...settings, updateIntervalMs: 30_000, updateDistanceM: 150 } })} />
        </View>
      </View>
      <Divider />

      <View style={styles.settingBlock}>
        <SectionTitle>Permissions</SectionTitle>
        <PermissionRow label="Notifications" granted={permissions.notifications} />
        <PermissionRow label="Location while using Navo" granted={permissions.foreground} />
        <PermissionRow label="Background location" granted={permissions.background} />
        <PrimaryButton title={busy ? 'Checking…' : 'Check permissions'} disabled={busy} onPress={() => void requestBasics()} />
        <Pressable accessibilityRole="button" onPress={openSystemSettings} style={styles.settingsLink}>
          <Text style={[styles.linkText, { color: colors.accent }]}>Open phone settings</Text>
        </Pressable>
      </View>
      <Divider />

      <View style={styles.settingBlock}>
        <SectionTitle>Alert reliability</SectionTitle>
        <DataSeal label="No alarm-clock override" tone="warning" />
        <Subtle>Navo uses local notifications. Focus, silent mode, notification settings, low battery, signal loss, and device background limits may delay or silence them.</Subtle>
        <Subtle>Live lock-screen progress is not implemented yet. Android shows a system location-service notice during an enabled trip.</Subtle>
      </View>
    </Screen>
  );
}

function Option({ label, detail, selected, onPress }: { label: string; detail: string; selected: boolean; onPress: () => void }) {
  const colors = useNavoColors();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.option, { borderColor: selected ? colors.accent : colors.line, backgroundColor: selected ? colors.accentSoft : colors.surface }]}>
      <Text style={[styles.optionLabel, { color: colors.ink }]}>{label}</Text>
      <Text style={[styles.optionDetail, { color: colors.muted }]}>{detail}</Text>
    </Pressable>
  );
}

function PermissionRow({ label, granted }: { label: string; granted: boolean }) {
  return (
    <View style={styles.permissionRow}>
      <Body>{label}</Body>
      <DataSeal label={granted ? 'On' : 'Off'} tone={granted ? 'success' : 'warning'} />
      <Text accessibilityLabel={granted ? 'Permission enabled' : 'Permission disabled'} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>{granted ? 'Enabled' : 'Disabled'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', gap: 16, alignItems: 'center', justifyContent: 'space-between' },
  switchCopy: { flex: 1, gap: 4 },
  settingBlock: { gap: 14 },
  optionRow: { flexDirection: 'row', gap: 10 },
  option: { flex: 1, minHeight: 75, padding: 12, borderWidth: 1, borderRadius: 12, justifyContent: 'center', gap: 4 },
  optionLabel: { fontSize: 15, fontWeight: '700' },
  optionDetail: { fontSize: 12, fontWeight: '600' },
  permissionRow: { minHeight: 46, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  settingsLink: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  linkText: { fontWeight: '600', fontSize: 14 },
});
