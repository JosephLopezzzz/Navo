import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, Screen, ScreenTitle, Subtle } from '../../components/ui';
import { armDestinationAlarm, disarmDestinationAlarm } from '../../domain/destination-alarm';
import { beginBackgroundLocation } from '../../services/background-location';
import { createPlacesSearchSessionId } from '../../services/tomtom';
import { readAlarmPermissions, requestAlarmPermissions, type AlarmPermissionSummary } from '../../services/alarm-permissions';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

export default function EnableAlarmScreen() {
  const params = useLocalSearchParams<{ alarmId?: string }>();
  const alarmId = typeof params.alarmId === 'string' ? params.alarmId : '';
  const app = useAppState();
  const colors = useNavoColors();
  const [permissions, setPermissions] = useState<AlarmPermissionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const alarm = app.destinationAlarms.find((item) => item.id === alarmId);
  const destination = alarm ? app.destinations.find((item) => item.id === alarm.destinationId) : undefined;

  useFocusEffect(useCallback(() => {
    let focused = true;
    void readAlarmPermissions().then((summary) => { if (focused) setPermissions(summary); }).catch(() => undefined);
    return () => { focused = false; };
  }, []));

  const requestAndEnable = async () => {
    if (!alarm || !destination || busy) return;
    setBusy(true);
    setProblem('');
    try {
      const result = await requestAlarmPermissions();
      setPermissions(result);
      if (!result.ready) {
        await app.mutateState((current) => ({
          ...current,
          firstRun: { ...current.firstRun, permissionNoticeAlarmId: alarm.id },
        }));
        router.replace('/(tabs)');
        return;
      }

      const sessionId = createPlacesSearchSessionId();
      await app.mutateState((current) => ({
        ...current,
        firstRun: { ...current.firstRun, permissionNoticeAlarmId: null },
        destinationAlarms: current.destinationAlarms.map((item) => item.id === alarm.id
          ? armDestinationAlarm(item, sessionId)
          : item),
      }));
      await beginBackgroundLocation(app.settings);
      router.replace('/(tabs)');
    } catch (error) {
      const latestPermissions = await readAlarmPermissions().catch(() => null);
      await app.mutateState((current) => ({
        ...current,
        firstRun: latestPermissions && !latestPermissions.ready
          ? { ...current.firstRun, permissionNoticeAlarmId: alarm.id }
          : current.firstRun,
        destinationAlarms: current.destinationAlarms.map((item) => item.id === alarm.id ? disarmDestinationAlarm(item) : item),
      })).catch(() => undefined);
      if (latestPermissions) setPermissions(latestPermissions);
      setProblem(error instanceof Error ? error.message : 'Navo could not enable this alarm. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const keepOff = () => {
    router.back();
  };

  const permissionState = (granted: boolean | undefined) => granted ? 'Allowed' : granted === false ? 'Needed' : 'Checking';
  const footer = (
    <>
      {problem ? <Text accessibilityRole="alert" style={[styles.problem, { color: colors.danger }]}>{problem}</Text> : null}
      <PrimaryButton title={busy ? 'Checking permissions…' : 'Continue to permissions'} onPress={() => void requestAndEnable()} disabled={!app.ready || !alarm || busy} />
      <Pressable accessibilityRole="button" onPress={keepOff} disabled={busy} style={styles.keepOff}>
        <Text style={[styles.keepOffText, { color: colors.muted }]}>Keep alarm off</Text>
      </Pressable>
    </>
  );

  if (!app.ready || !alarm || !destination) {
    return (
      <Screen>
        <ScreenTitle>{app.ready ? 'Alarm not found' : 'Loading alarm'}</ScreenTitle>
        <Subtle>{app.ready ? 'This saved alarm may have been removed.' : 'Reading saved alarms from this device.'}</Subtle>
        {app.ready ? <PrimaryButton title="Back to alarms" onPress={() => router.replace('/(tabs)')} /> : null}
      </Screen>
    );
  }

  return (
    <Screen footer={footer}>
      <View style={styles.heading}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to saved alarms" onPress={keepOff} style={styles.backButton}>
          <Feather name="arrow-left" size={19} color={colors.ink} />
        </Pressable>
        <ScreenTitle>Enable alarm</ScreenTitle>
      </View>
      <View style={[styles.mark, { backgroundColor: colors.accentSoft }]}><Feather name="shield" size={23} color={colors.accent} /></View>
      <Text style={[styles.eyebrow, { color: colors.accent }]}>ONE-TIME SETUP</Text>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Let’s get your alarm ready.</Text>
        <Subtle>These permissions help Navo remind you near {destination.name}.</Subtle>
      </View>

      <View style={styles.permissionList}>
        <PermissionRow icon="map-pin" title="Location" detail="While using Navo and in the background" status={permissionState(permissions?.foreground && permissions.background)} />
        <PermissionRow icon="bell" title="Notifications" detail="Arrival alerts when you’re near your stop" status={permissionState(permissions?.notifications)} />
      </View>
      <Subtle style={styles.note}>Your phone will ask for each permission. You can review your choices in Settings.</Subtle>
    </Screen>
  );
}

function PermissionRow({ icon, title, detail, status }: { icon: keyof typeof Feather.glyphMap; title: string; detail: string; status: string }) {
  const colors = useNavoColors();
  const ready = status === 'Allowed';
  return (
    <View style={[styles.permissionRow, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={[styles.permissionIcon, { backgroundColor: colors.accentSoft }]}><Feather name={icon} size={16} color={colors.accent} /></View>
      <View style={styles.permissionCopy}>
        <Text style={[styles.permissionTitle, { color: colors.ink }]}>{title}</Text>
        <Text style={[styles.permissionDetail, { color: colors.muted }]}>{detail}</Text>
      </View>
      <Text style={[styles.permissionStatus, { color: ready ? colors.success : colors.muted }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9 },
  backButton: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  mark: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  eyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.45 },
  intro: { gap: 6, marginTop: -8 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: '700', letterSpacing: -0.5 },
  permissionList: { gap: 9 },
  permissionRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderWidth: 1, borderRadius: 13 },
  permissionIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  permissionCopy: { flex: 1, gap: 2 },
  permissionTitle: { fontSize: 13, fontWeight: '700' },
  permissionDetail: { fontSize: 10, lineHeight: 14 },
  permissionStatus: { fontSize: 10, fontWeight: '700' },
  note: { fontSize: 11, lineHeight: 16 },
  problem: { fontSize: 12, lineHeight: 17 },
  keepOff: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  keepOffText: { fontSize: 12, fontWeight: '600' },
});
