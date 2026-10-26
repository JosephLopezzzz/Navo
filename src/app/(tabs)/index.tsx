import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { DataSeal, Screen, ScreenTitle, Subtle } from '../../components/ui';
import { NavoMark } from '../../components/NavoMark';
import { armDestinationAlarm, disarmDestinationAlarm } from '../../domain/destination-alarm';
import type { DestinationAlarm, SavedDestination } from '../../domain/models';
import { beginBackgroundLocation, stopBackgroundLocationIfIdle } from '../../services/background-location';
import { createPlacesSearchSessionId } from '../../services/tomtom';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

function destinationType(destination: SavedDestination): string {
  if (destination.kind === 'rail-station') return 'Rail';
  if (destination.kind === 'bus-dropoff') return 'Bus';
  return 'Place';
}

function alarmStatus(
  alarm: DestinationAlarm | undefined,
  locationAt: number | null,
  locationProblem: string | null,
): { label: string; detail: string; tone: 'warning' | 'success' } | null {
  if (!alarm) return null;
  if (alarm.watchState === 'alerted') return { label: 'Alert sent', detail: 'The alarm stopped after this alert.', tone: 'success' };
  if (!alarm.enabled) return null;
  if (locationProblem) return { label: 'Check location', detail: locationProblem, tone: 'warning' };
  if (alarm.watchState === 'awaiting-exit') {
    return { label: 'Waiting to arm', detail: 'Move outside the alert area to start monitoring.', tone: 'warning' };
  }
  if (!locationAt || Date.now() - locationAt > 90_000) {
    return { label: 'Waiting for GPS', detail: 'The alarm is on and needs a fresh location fix.', tone: 'warning' };
  }
  const detail = alarm.lastDistanceM === null
    ? `Alert within ${alarm.radiusM} m`
    : `${Math.round(alarm.lastDistanceM)} m away · alerts within ${alarm.radiusM} m`;
  return { label: 'Monitoring', detail, tone: 'success' };
}

export default function RideHomeScreen() {
  const colors = useNavoColors();
  const app = useAppState();
  const [busyAlarmId, setBusyAlarmId] = useState<string | null>(null);
  const [actionProblem, setActionProblem] = useState<string | null>(null);

  const toggleAlarm = async (alarm: DestinationAlarm, enabled: boolean) => {
    if (busyAlarmId) return;
    setBusyAlarmId(alarm.id);
    setActionProblem(null);
    try {
      if (enabled) {
        const sessionId = createPlacesSearchSessionId();
        await app.mutateState((current) => ({
          ...current,
          destinationAlarms: current.destinationAlarms.map((item) => item.id === alarm.id
            ? armDestinationAlarm(item, sessionId)
            : item),
        }));
        await beginBackgroundLocation(app.settings);
      } else {
        await app.mutateState((current) => ({
          ...current,
          destinationAlarms: current.destinationAlarms.map((item) => item.id === alarm.id ? disarmDestinationAlarm(item) : item),
        }));
        if (alarm.notificationIdentifier) {
          await Notifications.dismissNotificationAsync(alarm.notificationIdentifier).catch(() => undefined);
        }
        await stopBackgroundLocationIfIdle();
      }
    } catch (error) {
      if (enabled) {
        await app.mutateState((current) => ({
          ...current,
          destinationAlarms: current.destinationAlarms.map((item) => item.id === alarm.id ? disarmDestinationAlarm(item) : item),
        })).catch(() => undefined);
        await stopBackgroundLocationIfIdle().catch(() => undefined);
      }
      setActionProblem(error instanceof Error ? error.message : 'Navo could not change this alarm. Try again.');
    } finally {
      setBusyAlarmId(null);
    }
  };

  const removeDestination = async (destination: SavedDestination) => {
    if (busyAlarmId) return;
    const alarm = app.destinationAlarms.find((item) => item.destinationId === destination.id);
    setBusyAlarmId(alarm?.id ?? destination.id);
    setActionProblem(null);
    try {
      await app.mutateState((current) => ({
        ...current,
        destinations: current.destinations.filter((item) => item.id !== destination.id),
        destinationAlarms: current.destinationAlarms.filter((item) => item.destinationId !== destination.id),
      }));
      if (alarm?.notificationIdentifier) await Notifications.dismissNotificationAsync(alarm.notificationIdentifier).catch(() => undefined);
      await stopBackgroundLocationIfIdle();
    } catch {
      setActionProblem('Navo could not remove this destination from your device. Try again.');
    } finally {
      setBusyAlarmId(null);
    }
  };

  const confirmRemove = (destination: SavedDestination) => {
    Alert.alert('Remove this destination?', 'Its saved alarm will also be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { void removeDestination(destination); } },
    ]);
  };

  const showOptions = (destination: SavedDestination) => {
    Alert.alert(destination.name, 'Destination options', [
      { text: 'Edit alarm', onPress: () => router.push({ pathname: '/destination/pick', params: { destinationId: destination.id } }) },
      { text: 'Remove destination', style: 'destructive', onPress: () => confirmRemove(destination) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openPicker = () => router.push({ pathname: '/destination/pick', params: { kind: 'rail-station' } });
  const dismissNotice = () => {
    setActionProblem(null);
    void app.updateState({ settings: { ...app.settings, locationNoticeDismissed: true } }).catch(() => {
      setActionProblem('Navo could not save that preference. Try again.');
    });
  };

  return (
    <Screen tabBar>
      <View style={styles.brandRow}>
        <View style={styles.brandName}>
          <NavoMark size={34} />
          <Text style={[styles.wordmark, { color: colors.ink }]}>Navo</Text>
        </View>
      </View>

      <View style={styles.titleRow}>
        <ScreenTitle>Saved alarms</ScreenTitle>
        <Text style={[styles.count, { color: colors.muted }]}>{app.destinations.length} saved</Text>
      </View>

      {app.activeTrip && app.activeRoute && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/trip/active')}
          style={({ pressed }) => [styles.tripCard, { backgroundColor: colors.accentSoft, opacity: pressed ? 0.82 : 1 }]}
        >
          <View style={styles.tripIcon}><Feather name="navigation" size={17} color={colors.accent} /></View>
          <View style={styles.tripCopy}>
            <Text style={[styles.tripTitle, { color: colors.ink }]}>Trip in progress</Text>
            <Text numberOfLines={1} style={[styles.tripDetail, { color: colors.muted }]}>
              {app.activeRoute.name} · toward {app.activeRoute.stops[app.activeTrip.destinationIndex]?.name}
            </Text>
          </View>
          <Feather name="chevron-right" size={19} color={colors.accent} />
        </Pressable>
      )}

      {app.destinations.length === 0 ? (
        <View style={[styles.emptyState, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          <View style={[styles.emptyMark, { backgroundColor: colors.accentSoft }]}>
            <Feather name="map-pin" size={20} color={colors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>No alarms yet</Text>
          <Subtle style={styles.emptyCopy}>Add a stop to get alerted nearby.</Subtle>
          <Pressable accessibilityRole="button" onPress={openPicker} style={[styles.primaryAction, { backgroundColor: colors.accent }]}>
            <Feather name="plus" size={17} color={colors.onAccent} />
            <Text style={[styles.primaryActionText, { color: colors.onAccent }]}>Add alarm</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.alarmList}>
          {app.destinations.map((destination) => {
            const alarm = app.destinationAlarms.find((item) => item.destinationId === destination.id);
            const status = alarmStatus(alarm, app.lastLocationAt, app.locationProblem);
            const isBusy = busyAlarmId === alarm?.id || busyAlarmId === destination.id;
            return (
              <View key={destination.id} style={[styles.destinationCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <View style={styles.cardTop}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit alarm for ${destination.name}`}
                    onPress={() => router.push({ pathname: '/destination/pick', params: { destinationId: destination.id } })}
                    style={styles.destinationMain}
                  >
                    <View style={[styles.destinationIcon, { backgroundColor: colors.accentSoft }]}>
                      <Feather name={destination.kind === 'rail-station' ? 'navigation' : destination.kind === 'bus-dropoff' ? 'truck' : 'map-pin'} size={17} color={colors.accent} />
                    </View>
                    <View style={styles.destinationCopy}>
                      <Text style={[styles.destinationKind, { color: colors.muted }]}>{destinationType(destination)}</Text>
                      <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.destinationName, { color: colors.ink }]}>{destination.name}</Text>
                      <Text numberOfLines={1} style={[styles.destinationSubtitle, { color: colors.muted }]}>
                        {destination.subtitle || (destination.source === 'map-pin' ? 'Pinned location' : 'Place selected from search')}
                      </Text>
                    </View>
                  </Pressable>

                  <View style={styles.cardControls}>
                    {isBusy ? <ActivityIndicator accessibilityLabel="Updating alarm" color={colors.accent} style={styles.switchBusy} /> : (
                      <Switch
                        accessibilityLabel={`Alarm for ${destination.name}`}
                        accessibilityHint="Starts or stops destination location monitoring."
                        value={Boolean(alarm?.enabled)}
                        onValueChange={(enabled) => alarm && void toggleAlarm(alarm, enabled)}
                        trackColor={{ false: colors.line, true: colors.accent }}
                        thumbColor={colors.surface}
                      />
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`More options for ${destination.name}`}
                      onPress={() => showOptions(destination)}
                      hitSlop={6}
                      style={styles.moreButton}
                    >
                      <Feather name="more-vertical" size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                </View>
                {status && (
                  <View style={styles.statusRow}>
                    <DataSeal label={status.label} tone={status.tone} />
                    <Text numberOfLines={2} style={[styles.statusDetail, { color: colors.muted }]}>{status.detail}</Text>
                  </View>
                )}
              </View>
            );
          })}

          <Pressable accessibilityRole="button" onPress={openPicker} style={[styles.addButton, { borderColor: colors.line }]}>
            <Feather name="plus" size={17} color={colors.accent} />
            <Text style={[styles.addButtonText, { color: colors.ink }]}>Add alarm</Text>
          </Pressable>
        </View>
      )}

      {app.destinations.length > 0 && !app.settings.locationNoticeDismissed && (
        <View style={[styles.notice, { backgroundColor: colors.raised }]}>
          <Feather name="info" size={16} color={colors.accent} />
          <Text style={[styles.noticeText, { color: colors.muted }]}>
            Location runs while an alarm or trip is active.{' '}
            <Text accessibilityRole="link" onPress={() => router.push('/legal/location-safety')} style={{ color: colors.accent }}>How alarms work</Text>
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss location notice" onPress={dismissNotice} style={styles.dismissButton}>
            <Feather name="x" size={16} color={colors.muted} />
          </Pressable>
        </View>
      )}

      {actionProblem && <Text accessibilityRole="alert" style={[styles.actionProblem, { color: colors.danger }]}>{actionProblem}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: { minHeight: 38, justifyContent: 'center' },
  brandName: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  wordmark: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  count: { fontSize: 13, fontWeight: '600' },
  tripCard: { minHeight: 62, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  tripIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  tripCopy: { flex: 1, gap: 3 },
  tripTitle: { fontSize: 14, fontWeight: '700' },
  tripDetail: { fontSize: 12 },
  alarmList: { gap: 10 },
  destinationCard: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 9, gap: 6 },
  cardTop: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 4 },
  destinationMain: { flex: 1, minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10 },
  destinationIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  destinationCopy: { flex: 1, gap: 2, paddingVertical: 3 },
  destinationKind: { fontSize: 11, fontWeight: '600' },
  destinationName: { fontSize: 15, lineHeight: 19, fontWeight: '700', letterSpacing: -0.2 },
  destinationSubtitle: { fontSize: 12 },
  cardControls: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  switchBusy: { width: 48, height: 42 },
  moreButton: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30, paddingLeft: 48 },
  statusDetail: { flex: 1, fontSize: 12, lineHeight: 17 },
  emptyState: { alignItems: 'center', paddingVertical: 23, paddingHorizontal: 18, borderWidth: 1, borderRadius: 16, gap: 9 },
  emptyMark: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyCopy: { textAlign: 'center' },
  primaryAction: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', gap: 8, marginTop: 2, borderRadius: 13 },
  primaryActionText: { fontSize: 15, fontWeight: '700' },
  addButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 13 },
  addButtonText: { fontSize: 14, fontWeight: '700' },
  notice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 11, paddingRight: 5, borderRadius: 12 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17 },
  dismissButton: { width: 38, height: 40, alignItems: 'center', justifyContent: 'center' },
  actionProblem: { fontSize: 13, lineHeight: 19 },
});
