import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, StyleSheet, Switch, Text, View, type ScrollViewInstance } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import * as Notifications from 'expo-notifications';
import { Screen, ScreenTitle, Subtle } from '../../components/ui';
import { NavoMark } from '../../components/NavoMark';
import { armDestinationAlarm, disarmDestinationAlarm } from '../../domain/destination-alarm';
import type { DestinationAlarm, SavedDestination } from '../../domain/models';
import { beginBackgroundLocation, stopBackgroundLocationIfIdle } from '../../services/background-location';
import { createPlacesSearchSessionId } from '../../services/tomtom';
import { readAlarmPermissions, type AlarmPermissionSummary } from '../../services/alarm-permissions';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';
import { GuideTarget, useGuideControls } from '../../components/guide/GuideTargets';

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
  if (!alarm?.enabled) return null;
  if (alarm.watchState === 'alerted') return { label: 'Alert sent', detail: 'The alarm stopped after this alert.', tone: 'success' };
  if (locationProblem) return { label: 'Check location', detail: locationProblem, tone: 'warning' };
  if (alarm.watchState === 'awaiting-exit') return { label: 'Waiting to arm', detail: 'Move outside the alert area to start monitoring.', tone: 'warning' };
  if (!locationAt || Date.now() - locationAt > 90_000) return { label: 'Waiting for GPS', detail: 'The alarm is on and needs a fresh location fix.', tone: 'warning' };
  const detail = alarm.lastDistanceM === null
    ? `Alert within ${alarm.radiusM} m`
    : `${Math.round(alarm.lastDistanceM)} m away · alerts within ${alarm.radiusM} m`;
  return { label: 'Monitoring', detail, tone: 'success' };
}

export default function RideHomeScreen() {
  const colors = useNavoColors();
  const app = useAppState();
  const guide = useGuideControls();
  const [busyAlarmId, setBusyAlarmId] = useState<string | null>(null);
  const [actionProblem, setActionProblem] = useState<string | null>(null);
  const [permissionSummary, setPermissionSummary] = useState<AlarmPermissionSummary | null>(null);
  const screenScrollRef = useRef<ScrollViewInstance>(null);

  const refreshPermissions = useCallback(() => {
    void readAlarmPermissions().then(setPermissionSummary).catch(() => setPermissionSummary(null));
  }, []);

  useFocusEffect(useCallback(() => { refreshPermissions(); }, [refreshPermissions]));
  useEffect(() => {
    if (!guide.visible || guide.step !== 1 || app.destinations.length === 0) return;
    const frame = requestAnimationFrame(() => screenScrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [app.destinations.length, guide.step, guide.visible]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermissions();
    });
    return () => subscription.remove();
  }, [refreshPermissions]);

  const openPicker = () => {
    if (guide.visible) guide.finishGuide();
    router.push({ pathname: '/destination/pick', params: { kind: app.firstRun.preferences.preferredMode } });
  };

  const toggleAlarm = async (alarm: DestinationAlarm, enabled: boolean) => {
    if (busyAlarmId) return;
    setBusyAlarmId(alarm.id);
    setActionProblem(null);
    try {
      if (enabled) {
        const permissions = await readAlarmPermissions();
        setPermissionSummary(permissions);
        if (!permissions.ready) {
          router.push({ pathname: '/alarm/enable', params: { alarmId: alarm.id } });
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
      } else {
        await app.mutateState((current) => ({
          ...current,
          destinationAlarms: current.destinationAlarms.map((item) => item.id === alarm.id ? disarmDestinationAlarm(item) : item),
          firstRun: current.firstRun.permissionNoticeAlarmId === alarm.id
            ? { ...current.firstRun, permissionNoticeAlarmId: null }
            : current.firstRun,
        }));
        if (alarm.notificationIdentifier) await Notifications.dismissNotificationAsync(alarm.notificationIdentifier).catch(() => undefined);
        await stopBackgroundLocationIfIdle();
      }
    } catch (error) {
      if (enabled) {
        const latestPermissions = await readAlarmPermissions().catch(() => null);
        if (latestPermissions && !latestPermissions.ready) {
          await app.mutateState((current) => ({
            ...current,
            firstRun: { ...current.firstRun, permissionNoticeAlarmId: alarm.id },
            destinationAlarms: current.destinationAlarms.map((item) => item.id === alarm.id ? disarmDestinationAlarm(item) : item),
          })).catch(() => undefined);
          setPermissionSummary(latestPermissions);
        } else {
          await app.mutateState((current) => ({
            ...current,
            destinationAlarms: current.destinationAlarms.map((item) => item.id === alarm.id ? disarmDestinationAlarm(item) : item),
          })).catch(() => undefined);
          setActionProblem(error instanceof Error ? error.message : 'Navo could not change this alarm. Try again.');
        }
        await stopBackgroundLocationIfIdle().catch(() => undefined);
      } else {
        setActionProblem(error instanceof Error ? error.message : 'Navo could not change this alarm. Try again.');
      }
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
        firstRun: current.firstRun.permissionNoticeAlarmId === alarm?.id
          ? { ...current.firstRun, permissionNoticeAlarmId: null }
          : current.firstRun,
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

  const dismissNotice = () => {
    setActionProblem(null);
    void app.updateState({ settings: { ...app.settings, locationNoticeDismissed: true } }).catch(() => {
      setActionProblem('Navo could not save that preference. Try again.');
    });
  };

  const permissionAlarm = app.destinations.find((destination) => app.destinationAlarms.find((alarm) => alarm.id === app.firstRun.permissionNoticeAlarmId)?.destinationId === destination.id);
  const permissionAlarmRecord = app.destinationAlarms.find((alarm) => alarm.id === app.firstRun.permissionNoticeAlarmId);
  const showPermissionNotice = Boolean(permissionAlarm && permissionAlarmRecord && !permissionAlarmRecord.enabled && permissionSummary && !permissionSummary.ready);
  const permissionNoticeText = permissionSummary?.notifications
    ? permissionSummary.foreground
      ? 'Background location is off. Allow it in your phone settings so Navo can check this stop while the app is closed.'
      : 'Location access is off. Allow it in your phone settings to enable this alarm.'
    : 'Notifications are off. Allow them in your phone settings to receive arrival alerts.';
  const enabledCount = app.destinationAlarms.filter((alarm) => alarm.enabled).length;
  const allAlarmsLabel = enabledCount === 0 ? 'All off' : `${enabledCount} on`;

  return (
    <Screen tabBar scrollRef={screenScrollRef}>
      <View style={styles.brandRow}>
        <View style={styles.brandName}><NavoMark size={34} /><Text style={[styles.wordmark, { color: colors.ink }]}>Navo</Text></View>
        {app.firstRun.preferences.displayName ? <Text style={[styles.greeting, { color: colors.muted }]}>Hi, {app.firstRun.preferences.displayName.trim().split(/\s+/)[0]}</Text> : null}
      </View>

      <View style={styles.titleBlock}>
        <ScreenTitle>Saved alarms</ScreenTitle>
        <Text style={[styles.count, { color: colors.muted }]}>{app.destinations.length} saved · {allAlarmsLabel}</Text>
      </View>

      {app.activeTrip && app.activeRoute ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/trip/active')} style={({ pressed }) => [styles.tripCard, { backgroundColor: colors.accentSoft, opacity: pressed ? 0.82 : 1 }]}>
          <View style={[styles.tripIcon, { backgroundColor: colors.surface }]}><Feather name="navigation" size={17} color={colors.accent} /></View>
          <View style={styles.tripCopy}>
            <Text style={[styles.tripTitle, { color: colors.ink }]}>Trip in progress</Text>
            <Text numberOfLines={1} style={[styles.tripDetail, { color: colors.muted }]}>{app.activeRoute.name} · toward {app.activeRoute.stops[app.activeTrip.destinationIndex]?.name}</Text>
          </View>
          <Feather name="chevron-right" size={19} color={colors.accent} />
        </Pressable>
      ) : null}

      {app.destinations.length === 0 ? (
        <GuideTarget id="saved-alarms" style={styles.emptyStateTarget}>
          <View style={styles.emptyState}>
            <View style={[styles.emptyIntro, { backgroundColor: colors.raised }]}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>READY WHEN YOU ARE</Text>
              <Text style={[styles.emptyTitle, { color: colors.ink }]}>Never miss your stop.</Text>
              <Subtle>Choose a destination. Navo reminds you when you’re nearby.</Subtle>
              <EmptyRouteArtwork />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={[styles.emptySubTitle, { color: colors.ink }]}>Your first stop starts here</Text>
              <Subtle>Add a rail station, bus stop, or place. Your saved alarms will appear here.</Subtle>
            </View>
            <GuideTarget id="add-alarm" style={styles.addAlarmTarget}>
              <Pressable accessibilityRole="button" onPress={openPicker} style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.accent, opacity: pressed ? 0.84 : 1 }]}>
                <Feather name="plus" size={17} color={colors.onAccent} />
                <Text style={[styles.primaryActionText, { color: colors.onAccent }]}>Create my first alarm</Text>
              </Pressable>
            </GuideTarget>
          </View>
        </GuideTarget>
      ) : (
        <View style={styles.alarmList}>
          {app.destinations.map((destination, index) => {
            const alarm = app.destinationAlarms.find((item) => item.destinationId === destination.id);
            const status = alarmStatus(alarm, app.lastLocationAt, app.locationProblem);
            const isBusy = busyAlarmId === alarm?.id || busyAlarmId === destination.id;
            const card = (
              <View style={[styles.destinationCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <View style={styles.cardTop}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit alarm for ${destination.name}`} onPress={() => { if (guide.visible) guide.finishGuide(); router.push({ pathname: '/destination/pick', params: { destinationId: destination.id } }); }} style={styles.destinationMain}>
                    <View style={[styles.destinationIcon, { backgroundColor: colors.accentSoft }]}>
                      <Feather name={destination.kind === 'rail-station' ? 'navigation' : destination.kind === 'bus-dropoff' ? 'truck' : 'map-pin'} size={17} color={colors.accent} />
                    </View>
                    <View style={styles.destinationCopy}>
                      <Text style={[styles.destinationKind, { color: colors.muted }]}>{destinationType(destination).toUpperCase()}</Text>
                      <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.destinationName, { color: colors.ink }]}>{destination.name}</Text>
                      <Text numberOfLines={1} style={[styles.destinationSubtitle, { color: colors.muted }]}>{destination.subtitle || (destination.source === 'map-pin' ? 'Pinned location' : 'Place selected from search')}</Text>
                    </View>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`More options for ${destination.name}`} onPress={() => { if (guide.visible) guide.finishGuide(); showOptions(destination); }} hitSlop={6} style={styles.moreButton}>
                    <Feather name="more-vertical" size={18} color={colors.muted} />
                  </Pressable>
                </View>
                <View style={[styles.cardBottom, { borderTopColor: colors.line }]}>
                  <View style={styles.alarmStateCopy}>
                    <Text style={[styles.alarmState, { color: alarm?.enabled ? colors.success : colors.muted }]}>{alarm?.enabled ? 'On · alerts near this stop' : 'Off'}</Text>
                    {status ? <Text numberOfLines={2} style={[styles.statusDetail, { color: colors.muted }]}>{status.label === 'Monitoring' ? status.detail : `${status.label} · ${status.detail}`}</Text> : null}
                  </View>
                  {isBusy ? <ActivityIndicator accessibilityLabel="Updating alarm" color={colors.accent} style={styles.switchBusy} /> : (
                    <Switch
                      accessibilityLabel={`Alarm for ${destination.name}`}
                      accessibilityHint="Starts or stops destination location monitoring. New alarms stay off until you turn them on."
                      value={Boolean(alarm?.enabled)}
                      onValueChange={(enabled) => { if (guide.visible) guide.finishGuide(); if (alarm) void toggleAlarm(alarm, enabled); }}
                      trackColor={{ false: colors.switchOffTrack, true: colors.accent }}
                      thumbColor={colors.switchThumb}
                    />
                  )}
                </View>
              </View>
            );
            return index === 0
              ? <GuideTarget key={destination.id} id="saved-alarms" style={styles.cardTarget}>{card}</GuideTarget>
              : <View key={destination.id}>{card}</View>;
          })}
          <GuideTarget id="add-alarm" style={styles.addAlarmTarget}>
            <Pressable accessibilityRole="button" onPress={openPicker} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.accent, opacity: pressed ? 0.84 : 1 }]}>
              <Feather name="plus" size={17} color={colors.onAccent} />
              <Text style={[styles.addButtonText, { color: colors.onAccent }]}>Add alarm</Text>
            </Pressable>
          </GuideTarget>
        </View>
      )}

      {showPermissionNotice && permissionAlarm ? (
        <View style={[styles.permissionNotice, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.permissionTitle, { color: colors.warning }]}>Your alarm is still off</Text>
          <Text style={[styles.noticeText, { color: colors.muted }]}>{permissionNoticeText}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings().catch(() => setActionProblem('Phone settings could not be opened.')); }} style={[styles.settingsAction, { backgroundColor: colors.raised }]}>
            <Text style={[styles.settingsActionText, { color: colors.ink }]}>Open phone settings</Text>
            <Feather name="external-link" size={15} color={colors.accent} />
          </Pressable>
        </View>
      ) : null}

      {app.destinations.length > 0 && !app.firstRun.guideCompleted ? (
        <Pressable accessibilityRole="button" onPress={guide.startGuide} style={({ pressed }) => [styles.quickTour, { backgroundColor: colors.raised, opacity: pressed ? 0.82 : 1 }]}>
          <View style={[styles.quickTourIcon, { backgroundColor: colors.accentSoft }]}><Feather name="help-circle" size={17} color={colors.accent} /></View>
          <View style={styles.tripCopy}>
            <Text style={[styles.tripTitle, { color: colors.ink }]}>A quick tour?</Text>
            <Text style={[styles.tripDetail, { color: colors.muted }]}>See how alarms, routes, and settings work.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.accent} />
        </Pressable>
      ) : null}

      {app.destinations.length > 0 && !app.settings.locationNoticeDismissed ? (
        <View style={[styles.notice, { backgroundColor: colors.raised }]}>
          <Feather name="info" size={16} color={colors.accent} />
          <Text style={[styles.noticeText, { color: colors.muted }]}>Location runs while an alarm or trip is active.{' '}
            <Text accessibilityRole="link" onPress={() => router.push('/legal/location-safety')} style={{ color: colors.accent }}>How alarms work</Text>
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss location notice" onPress={dismissNotice} style={styles.dismissButton}>
            <Feather name="x" size={16} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      {actionProblem ? <Text accessibilityRole="alert" style={[styles.actionProblem, { color: colors.danger }]}>{actionProblem}</Text> : null}
    </Screen>
  );
}

function EmptyRouteArtwork() {
  const colors = useNavoColors();
  return (
    <View style={[styles.illustration, { backgroundColor: colors.background }]}>
      <Svg width="100%" height="100%" viewBox="0 0 320 150" accessibilityLabel="A route leading to a destination pin">
        <Path d="M0 40H72Q96 40 96 64V100Q96 124 120 124H208Q232 124 232 100V56Q232 32 256 32H320" fill="none" stroke={colors.raised} strokeWidth="24" />
        <Path d="M0 40H72Q96 40 96 64V100Q96 124 120 124H208Q232 124 232 100V56Q232 32 256 32H320" fill="none" stroke={colors.accent} strokeDasharray="6 8" strokeLinecap="round" strokeWidth="3" />
        <Circle cx="96" cy="64" r="7" fill={colors.background} stroke={colors.accent} strokeWidth="4" />
        <Circle cx="232" cy="56" r="19" fill={colors.accentSoft} />
        <Path d="M232 43c-7 0-12 5-12 12 0 8 12 19 12 19s12-11 12-19c0-7-5-12-12-12Z" fill="none" stroke={colors.accent} strokeWidth="3" />
        <Circle cx="232" cy="55" r="3" fill={colors.accent} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandName: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  wordmark: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  greeting: { fontSize: 12, fontWeight: '600' },
  titleBlock: { gap: 3 },
  count: { fontSize: 12, fontWeight: '600' },
  tripCard: { minHeight: 60, borderRadius: 14, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  tripIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  tripCopy: { flex: 1, gap: 3 },
  tripTitle: { fontSize: 13, fontWeight: '700' },
  tripDetail: { fontSize: 11, lineHeight: 16 },
  emptyStateTarget: { width: '100%' },
  emptyState: { gap: 13 },
  emptyIntro: { gap: 9, padding: 14, borderRadius: 17 },
  eyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.45 },
  emptyTitle: { fontSize: 23, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5 },
  illustration: { width: '100%', height: 132, overflow: 'hidden', borderRadius: 16, marginTop: 2 },
  emptyCopy: { gap: 4, paddingHorizontal: 1 },
  emptySubTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  addAlarmTarget: { width: '100%' },
  primaryAction: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', gap: 8, borderRadius: 13 },
  primaryActionText: { fontSize: 14, fontWeight: '700' },
  alarmList: { gap: 9 },
  cardTarget: { width: '100%' },
  destinationCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8 },
  cardTop: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 4 },
  destinationMain: { flex: 1, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10 },
  destinationIcon: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  destinationCopy: { flex: 1, gap: 2, paddingVertical: 3 },
  destinationKind: { fontSize: 9, fontWeight: '700', letterSpacing: 0.35 },
  destinationName: { fontSize: 14, lineHeight: 18, fontWeight: '700', letterSpacing: -0.15 },
  destinationSubtitle: { fontSize: 11 },
  moreButton: { minWidth: 40, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cardBottom: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 5 },
  alarmStateCopy: { flex: 1, gap: 2 },
  alarmState: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  statusDetail: { fontSize: 10, lineHeight: 14 },
  switchBusy: { width: 48, height: 44 },
  addButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13 },
  addButtonText: { fontSize: 14, fontWeight: '700' },
  permissionNotice: { gap: 8, padding: 12, borderRadius: 14, borderWidth: 1 },
  permissionTitle: { fontSize: 13, fontWeight: '700' },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 16 },
  settingsAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderRadius: 11 },
  settingsActionText: { fontSize: 12, fontWeight: '700' },
  quickTour: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderRadius: 14 },
  quickTourIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  notice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 11, paddingRight: 5, borderRadius: 12 },
  dismissButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionProblem: { fontSize: 13, lineHeight: 19 },
});
