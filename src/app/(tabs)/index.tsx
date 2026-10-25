import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { DataSeal, Divider, Screen, ScreenTitle, SectionTitle, Subtle } from '../../components/ui';
import { NavoMark } from '../../components/NavoMark';
import { armDestinationAlarm, disarmDestinationAlarm } from '../../domain/destination-alarm';
import type { DestinationAlarm, SavedDestination } from '../../domain/models';
import { beginBackgroundLocation, stopBackgroundLocationIfIdle } from '../../services/background-location';
import { createPlacesSearchSessionId } from '../../services/tomtom';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

function destinationLabel(destination: SavedDestination): string {
  if (destination.kind === 'rail-station') return 'RAIL STATION';
  if (destination.kind === 'bus-dropoff') return 'BUS DROP-OFF';
  return 'PLACE';
}

function statusFor(alarm: DestinationAlarm | undefined, locationAt: number | null, locationProblem: string | null): { label: string; tone: 'warning' | 'success' | 'neutral'; detail: string } {
  if (!alarm || (!alarm.enabled && alarm.watchState !== 'alerted')) return { label: 'Alarm off', tone: 'neutral', detail: 'Saved on this device' };
  if (alarm.watchState === 'alerted') return { label: 'Alert sent', tone: 'success', detail: 'Alarm switched off after this ride' };
  if (alarm.watchState === 'awaiting-exit') return { label: 'Leave this area', tone: 'warning', detail: 'Navo will arm after your phone moves away from the destination.' };
  if (locationProblem) return { label: 'Check location', tone: 'warning', detail: locationProblem };
  if (!locationAt || Date.now() - locationAt > 90_000) return { label: 'Waiting for GPS', tone: 'warning', detail: 'Navo is waiting for a fresh location reading.' };
  return {
    label: 'Tracking',
    tone: 'success',
    detail: alarm.lastDistanceM === null
      ? `Notification when you are near · ${alarm.radiusM} m radius`
      : `${Math.round(alarm.lastDistanceM)} m from destination · alert within ${alarm.radiusM} m`,
  };
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
      setActionProblem(error instanceof Error ? error.message : 'Navo could not change this destination alarm. Try again.');
    } finally {
      setBusyAlarmId(null);
    }
  };

  const deleteDestination = async (destination: SavedDestination) => {
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

  const openPicker = (kind = 'rail-station') => router.push({ pathname: '/destination/pick', params: { kind } });

  return (
    <Screen>
      <View style={styles.brandRow}>
        <View style={styles.brandName}>
          <NavoMark size={42} />
          <Text style={[styles.wordmark, { color: colors.ink }]}>Navo</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} hitSlop={10} style={styles.settingsButton}>
          <Feather name="sliders" size={20} color={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.intro}>
        <ScreenTitle>Your destination alarms</ScreenTitle>
        <Subtle>Save a station or drop-off once. Turn its alarm on when you start your ride.</Subtle>
      </View>

      {app.activeTrip && app.activeRoute && (
        <View style={[styles.activeSection, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          <View style={styles.activeTopline}>
            <Text style={[styles.activeTitle, { color: colors.ink }]}>Route sequence in progress</Text>
            <DataSeal label="Active" tone="success" />
          </View>
          <Text style={[styles.activeCopy, { color: colors.ink }]}>{app.activeRoute.name} · toward {app.activeRoute.stops[app.activeTrip.destinationIndex]?.name}</Text>
          <Subtle>{app.activeRoute.coordinateStatus === 'complete' ? 'Location route recorded by you' : 'Station sequence saved · manual progress'}</Subtle>
          <Pressable accessibilityRole="button" onPress={() => router.push('/trip/active')} style={[styles.activeLink, { borderColor: colors.line }]}>
            <Text style={[styles.activeLinkText, { color: colors.accent }]}>Return to trip</Text>
            <Feather name="arrow-up-right" size={17} color={colors.accent} />
          </Pressable>
        </View>
      )}

      <View style={styles.destinationsSection}>
        <SectionTitle accessory={<Subtle>{app.destinations.length} saved</Subtle>}>Saved destinations</SectionTitle>
        {app.destinations.length === 0 ? (
          <View style={[styles.emptyState, { borderColor: colors.line, backgroundColor: colors.surface }]}>
            <View style={[styles.emptyMark, { backgroundColor: colors.accentSoft }]}>
              <Feather name="map-pin" size={22} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>No destinations yet</Text>
            <Subtle style={styles.emptyCopy}>Search for a station or drop-off, or place a pin. Its alarm stays off until you switch it on.</Subtle>
            <Pressable accessibilityRole="button" onPress={() => openPicker()} style={[styles.emptyAction, { backgroundColor: colors.accent }]}>
              <Feather name="plus" size={17} color={colors.onAccent} />
              <Text style={[styles.emptyActionText, { color: colors.onAccent }]}>Add a destination</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            {app.destinations.map((destination, index) => {
              const alarm = app.destinationAlarms.find((item) => item.destinationId === destination.id);
              const status = statusFor(alarm, app.lastLocationAt, app.locationProblem);
              const isBusy = busyAlarmId === alarm?.id || busyAlarmId === destination.id;
              return (
                <View key={destination.id}>
                  <View style={styles.destinationRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${destination.name}`}
                      onPress={() => router.push({ pathname: '/destination/pick', params: { destinationId: destination.id } })}
                      style={styles.destinationMain}
                    >
                      <View style={[styles.destinationIcon, { backgroundColor: colors.accentSoft }]}>
                        <Feather name={destination.kind === 'rail-station' ? 'navigation' : destination.kind === 'bus-dropoff' ? 'truck' : 'map-pin'} size={17} color={colors.accent} />
                      </View>
                      <View style={styles.destinationCopy}>
                        <Text style={[styles.destinationKind, { color: colors.muted }]}>{destinationLabel(destination)}</Text>
                        <Text numberOfLines={1} style={[styles.destinationName, { color: colors.ink }]}>{destination.name}</Text>
                        <Text numberOfLines={1} style={[styles.destinationSubtitle, { color: colors.muted }]}>{destination.subtitle || `${destination.latitude.toFixed(4)}, ${destination.longitude.toFixed(4)}`}</Text>
                      </View>
                    </Pressable>
                    {isBusy ? <ActivityIndicator color={colors.accent} style={styles.switchBusy} /> : (
                      <Switch
                        accessibilityLabel={`Alarm for ${destination.name}`}
                        accessibilityHint="Starts or stops destination location tracking."
                        value={Boolean(alarm?.enabled)}
                        onValueChange={(enabled) => alarm && void toggleAlarm(alarm, enabled)}
                        trackColor={{ false: colors.line, true: colors.accent }}
                        thumbColor={colors.surface}
                      />
                    )}
                  </View>
                  <View style={styles.destinationStatus}>
                    <DataSeal label={status.label} tone={status.tone} />
                    <Text style={[styles.destinationDetail, { color: colors.muted }]}>{status.detail}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${destination.name}`} hitSlop={8} onPress={() => void deleteDestination(destination)} style={styles.deleteButton}>
                      <Feather name="trash-2" size={16} color={colors.quiet} />
                    </Pressable>
                  </View>
                  {index < app.destinations.length - 1 && <Divider />}
                </View>
              );
            })}
            <Pressable accessibilityRole="button" onPress={() => openPicker()} style={[styles.addButton, { borderColor: colors.line }]}>
              <Feather name="plus" size={17} color={colors.accent} />
              <Text style={[styles.addButtonText, { color: colors.ink }]}>Add another destination</Text>
            </Pressable>
          </View>
        )}
      </View>

      {actionProblem && <Text accessibilityRole="alert" style={[styles.actionProblem, { color: colors.danger }]}>{actionProblem}</Text>}

      <View style={[styles.locationNote, { backgroundColor: colors.raised }]}>
        <Feather name="shield" size={16} color={colors.accent} />
        <Text style={[styles.locationNoteText, { color: colors.muted }]}>Location checks stay on this phone and run only while a destination alarm or route trip is active. Android shows a persistent location notice. GPS and notification limits can delay an alert.</Text>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/routes')} style={styles.routesLink}>
        <Feather name="map" size={16} color={colors.accent} />
        <Text style={[styles.routesLinkText, { color: colors.accent }]}>Browse station sequences</Text>
        <Feather name="arrow-right" size={16} color={colors.accent} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 },
  brandName: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  wordmark: { fontSize: 21, fontWeight: '700', letterSpacing: -0.5 },
  settingsButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  intro: { gap: 9, paddingTop: 10, paddingBottom: 3 },
  activeSection: { gap: 10, padding: 15, borderWidth: 1, borderRadius: 14 },
  activeTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  activeTitle: { fontSize: 16, fontWeight: '700' },
  activeCopy: { fontSize: 15, fontWeight: '600' },
  activeLink: { minHeight: 48, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12 },
  activeLinkText: { fontSize: 15, fontWeight: '700' },
  destinationsSection: { gap: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 27, paddingHorizontal: 19, borderWidth: 1, borderRadius: 15, gap: 10 },
  emptyMark: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyCopy: { textAlign: 'center', maxWidth: 310 },
  emptyAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', marginTop: 3, borderRadius: 13 },
  emptyActionText: { fontSize: 15, fontWeight: '700' },
  destinationRow: { minHeight: 79, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8 },
  destinationMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  destinationIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  destinationCopy: { flex: 1, gap: 3 },
  destinationKind: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  destinationName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  destinationSubtitle: { fontSize: 12 },
  switchBusy: { width: 48 },
  destinationStatus: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 12 },
  destinationDetail: { flex: 1, fontSize: 12, lineHeight: 17 },
  deleteButton: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  addButton: { minHeight: 48, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12 },
  addButtonText: { fontSize: 14, fontWeight: '700' },
  actionProblem: { fontSize: 13, lineHeight: 19 },
  locationNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 12 },
  locationNoteText: { flex: 1, fontSize: 12, lineHeight: 18 },
  routesLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  routesLinkText: { fontSize: 14, fontWeight: '700' },
});
