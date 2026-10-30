import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, Screen, ScreenTitle, Subtle } from '../components/ui';
import { readAlarmPermissions, type AlarmPermissionSummary } from '../services/alarm-permissions';
import { useNavoColors } from '../theme/colors';

export default function AlarmPermissionsScreen() {
  const colors = useNavoColors();
  const [permissions, setPermissions] = useState<AlarmPermissionSummary | null>(null);
  const [problem, setProblem] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setProblem('');
    try {
      setPermissions(await readAlarmPermissions());
    } catch {
      setProblem('Permission status could not be read. Try again in a moment.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const openPhoneSettings = () => {
    void Linking.openSettings().catch(() => setProblem('Phone settings could not be opened.'));
  };

  return (
    <Screen>
      <View style={styles.heading}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to settings" onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={19} color={colors.ink} />
        </Pressable>
        <ScreenTitle>Alarm permissions</ScreenTitle>
      </View>
      <Subtle>Navo needs location and notifications to alert you near a saved stop. You can change access any time in your phone settings.</Subtle>
      <View style={styles.rows}>
        <PermissionRow title="Location while using Navo" status={permissions?.foreground ? 'Allowed' : permissions ? 'Off' : 'Checking'} />
        <PermissionRow title="Background location" status={permissions?.background ? 'Allowed' : permissions ? 'Off' : 'Checking'} />
        <PermissionRow title="Notifications" status={permissions?.notifications ? 'Allowed' : permissions ? 'Off' : 'Checking'} />
      </View>
      <View style={[styles.note, { backgroundColor: colors.accentSoft }]}>
        <Feather name="info" size={16} color={colors.accent} />
        <Text style={[styles.noteText, { color: colors.muted }]}>New alarms stay off until you turn them on. Navo asks for these permissions when you enable an alarm.</Text>
      </View>
      {problem ? <Text accessibilityRole="alert" style={[styles.problem, { color: colors.danger }]}>{problem}</Text> : null}
      <PrimaryButton title="Open phone settings" onPress={openPhoneSettings} />
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh permission status" onPress={() => void refresh()} style={styles.refresh}>
        <Feather name={refreshing ? 'loader' : 'refresh-cw'} size={15} color={colors.accent} />
        <Text style={[styles.refreshText, { color: colors.accent }]}>{refreshing ? 'Checking…' : 'Refresh status'}</Text>
      </Pressable>
    </Screen>
  );
}

function PermissionRow({ title, status }: { title: string; status: string }) {
  const colors = useNavoColors();
  const allowed = status === 'Allowed';
  return (
    <View style={[styles.permissionRow, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={[styles.statusIcon, { backgroundColor: allowed ? colors.successSoft : colors.warningSoft }]}>
        <Feather name={allowed ? 'check' : 'shield'} size={15} color={allowed ? colors.success : colors.warning} />
      </View>
      <Text style={[styles.permissionTitle, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.permissionStatus, { color: allowed ? colors.success : colors.warning }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9 },
  backButton: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  rows: { gap: 8 },
  permissionRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderWidth: 1, borderRadius: 13 },
  statusIcon: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  permissionTitle: { flex: 1, fontSize: 12, fontWeight: '600' },
  permissionStatus: { fontSize: 11, fontWeight: '700' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 11, borderRadius: 12 },
  noteText: { flex: 1, fontSize: 11, lineHeight: 16 },
  problem: { fontSize: 12, lineHeight: 17 },
  refresh: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  refreshText: { fontSize: 12, fontWeight: '700' },
});
