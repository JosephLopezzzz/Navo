import { router, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Linking, Modal, ScrollView, StyleSheet, Switch, Text, View, type ScrollViewInstance } from 'react-native';
import { NavoPressable as Pressable } from '../../components/NavoPressable';
import Svg, { Circle, Path } from 'react-native-svg';
import { Screen, ScreenTitle, Subtle } from '../../components/ui';
import { armDestinationAlarm, disarmDestinationAlarm } from '../../domain/destination-alarm';
import { removeSavedDestinations } from '../../domain/saved-alarm-actions';
import { dismissAlarmNotification } from '../../services/alarm-notification-delivery';
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

export default function RideHomeScreen() {
  const colors = useNavoColors();
  const app = useAppState();
  const guide = useGuideControls();
  const [busyAlarmId, setBusyAlarmId] = useState<string | null>(null);
  const [actionProblem, setActionProblem] = useState<string | null>(null);
  const [permissionSummary, setPermissionSummary] = useState<AlarmPermissionSummary | null>(null);
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<string[]>([]);
  const [removalIds, setRemovalIds] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removalProblem, setRemovalProblem] = useState<string | null>(null);
  const screenScrollRef = useRef<ScrollViewInstance>(null);
  const selectedIds = new Set(selectedDestinationIds.filter((id) => app.destinations.some((item) => item.id === id)));
  const isSelecting = selectedIds.size > 0;
  const pendingRemovals = app.destinations.filter((item) => removalIds?.includes(item.id));

  const clearSelection = useCallback(() => {
    setSelectedDestinationIds([]);
    setRemovalIds(null);
    setRemovalProblem(null);
  }, []);

  useFocusEffect(useCallback(() => clearSelection, [clearSelection]));
  useFocusEffect(useCallback(() => {
    if (!isSelecting) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!removing) clearSelection();
      return true;
    });
    return () => subscription.remove();
  }, [clearSelection, isSelecting, removing]));

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
    if (busyAlarmId || removing || isSelecting) return;
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
        if (alarm.notificationIdentifier) await dismissAlarmNotification(alarm.notificationIdentifier).catch(() => undefined);
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

  const removeSelectedDestinations = async () => {
    if (busyAlarmId || removing || !removalIds?.length) return;
    const idsToRemove = new Set(removalIds);
    let notificationIds: string[] = [];
    setRemoving(true);
    setActionProblem(null);
    setRemovalProblem(null);
    try {
      await app.mutateState((current) => {
        notificationIds = current.destinationAlarms
          .filter((alarm) => idsToRemove.has(alarm.destinationId))
          .flatMap((alarm) => alarm.notificationIdentifier ? [alarm.notificationIdentifier] : []);
        return removeSavedDestinations(current, removalIds);
      });
    } catch {
      setRemovalProblem('Navo could not delete these alarms from your device. Try again.');
      setRemoving(false);
      return;
    }
    clearSelection();
    const dismissals = await Promise.allSettled([...new Set(notificationIds)].map(dismissAlarmNotification));
    try {
      await stopBackgroundLocationIfIdle();
      if (dismissals.some((result) => result.status === 'rejected')) {
        setActionProblem('Alarms deleted. An existing notification could not be cleared; dismiss it from your phone.');
      }
    } catch {
      setActionProblem('Alarms deleted. Navo could not stop the idle location check. Restart the app to try again.');
    } finally {
      setRemoving(false);
    }
  };

  const selectDestination = (destinationId: string) => {
    if (busyAlarmId || removing) return;
    if (guide.visible) guide.finishGuide();
    setSelectedDestinationIds((current) => [...new Set([...current, destinationId])]);
  };

  const pressDestination = (destination: SavedDestination) => {
    if (busyAlarmId || removing) return;
    if (guide.visible) guide.finishGuide();
    if (isSelecting) {
      setSelectedDestinationIds((current) => selectedIds.has(destination.id)
        ? current.filter((id) => id !== destination.id)
        : [...current, destination.id]);
      return;
    }
    router.push({ pathname: '/destination/pick', params: { destinationId: destination.id } });
  };

  const closeRemovalDialog = () => {
    if (!removing) setRemovalIds(null);
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
    <Screen tabBar scrollRef={screenScrollRef} footer={isSelecting ? (
      <View style={styles.selectionFooter}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${selectedIds.size} selected ${selectedIds.size === 1 ? 'alarm' : 'alarms'}`}
          disabled={removing || Boolean(busyAlarmId)}
          onPress={() => { setRemovalProblem(null); setRemovalIds([...selectedIds]); }}
          style={({ pressed }) => [styles.deleteButton, { backgroundColor: pressed ? colors.dangerHover : colors.danger, opacity: removing ? 0.6 : 1 }]}
        >
          <Feather name="trash-2" size={18} color={colors.onAccent} />
          <Text style={[styles.deleteButtonText, { color: colors.onAccent }]}>Delete {selectedIds.size} {selectedIds.size === 1 ? 'alarm' : 'alarms'}</Text>
        </Pressable>
      </View>
    ) : undefined}>
      {app.firstRun.preferences.displayName || app.destinations.length > 0 ? (
        <View style={styles.greetingRow}>
          {app.firstRun.preferences.displayName ? <Text style={[styles.greeting, { color: colors.muted }]}>Hi, {app.firstRun.preferences.displayName.trim().split(/\s+/)[0]}</Text> : <View style={styles.greetingSpacer} />}
          {app.destinations.length > 0 && !isSelecting ? (
            <GuideTarget id="add-alarm" style={styles.addAlarmTopTarget}>
              <Pressable
                accessibilityRole="button"
                onPress={openPicker}
                android_ripple={{ color: colors.accentHover, foreground: true, alpha: 0.32 }}
                style={({ pressed }) => [styles.addButton, { backgroundColor: pressed ? colors.accentHover : colors.accent }]}
              >
                <Feather name="plus" size={17} color={colors.onAccent} />
                <Text style={[styles.addButtonText, { color: colors.onAccent }]}>Add alarm</Text>
              </Pressable>
            </GuideTarget>
          ) : null}
        </View>
      ) : null}

      <View style={styles.titleBlock}>
        <ScreenTitle>Saved alarms</ScreenTitle>
        <Text accessibilityLiveRegion="polite" style={[styles.count, { color: colors.muted }]}>{isSelecting ? `${selectedIds.size} selected` : `${app.destinations.length} saved · ${allAlarmsLabel}`}</Text>
      </View>

      {app.activeTrip && app.activeRoute ? (
        <Pressable motion="card" accessibilityRole="button" onPress={() => router.push('/trip/active')} style={({ pressed }) => [styles.tripCard, { backgroundColor: pressed ? colors.accentHoverSoft : colors.accentSoft, borderColor: pressed ? colors.accent : 'transparent' }]}>
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
              <Pressable accessibilityRole="button" onPress={openPicker} style={({ pressed }) => [styles.primaryAction, { backgroundColor: pressed ? colors.accentHover : colors.accent }]}>
                <Feather name="plus" size={17} color={colors.onAccent} />
                <Text style={[styles.primaryActionText, { color: colors.onAccent }]}>Create my first alarm</Text>
              </Pressable>
            </GuideTarget>
          </View>
        </GuideTarget>
      ) : (
        <View style={styles.alarmList}>
          {isSelecting ? (
            <View style={styles.selectionToolbar}>
              <Pressable accessibilityRole="button" disabled={removing} onPress={clearSelection} style={styles.selectionAction}>
                <Feather name="x" size={18} color={colors.ink} />
                <Text style={[styles.selectionActionText, { color: colors.ink }]}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={removing}
                onPress={() => setSelectedDestinationIds(selectedIds.size === app.destinations.length ? [] : app.destinations.map((item) => item.id))}
                style={styles.selectionAction}
              >
                <Text style={[styles.selectionActionText, { color: colors.accent }]}>{selectedIds.size === app.destinations.length ? 'Deselect all' : 'Select all'}</Text>
              </Pressable>
            </View>
          ) : <Text style={[styles.selectionHint, { color: colors.muted }]}>Tap to edit · Hold to select</Text>}
          {app.destinations.map((destination, index) => {
            const alarm = app.destinationAlarms.find((item) => item.destinationId === destination.id);
            const isBusy = busyAlarmId === alarm?.id || busyAlarmId === destination.id;
            const isSelected = selectedIds.has(destination.id);
            const card = (
              <View style={[styles.destinationCard, { backgroundColor: isSelected ? colors.accentSoft : colors.surface, borderColor: isSelected ? colors.accent : colors.line }]}>
                <Pressable
                  motion="card"
                  accessibilityRole={isSelecting ? 'checkbox' : 'button'}
                  accessibilityLabel={isSelecting ? `${destination.name}, ${destinationType(destination)}` : `Edit alarm for ${destination.name}, ${destinationType(destination)}`}
                  accessibilityHint={isSelecting ? 'Tap to select or deselect this alarm.' : 'Opens alarm details. Hold to select alarms for deletion.'}
                  accessibilityState={isSelecting ? { checked: isSelected, disabled: removing } : { disabled: Boolean(busyAlarmId) || removing }}
                  accessibilityActions={isSelecting ? [] : [{ name: 'select', label: 'Select for deletion' }]}
                  onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'select') selectDestination(destination.id); }}
                  disabled={Boolean(busyAlarmId) || removing}
                  onPress={() => pressDestination(destination)}
                  onLongPress={() => selectDestination(destination.id)}
                  style={({ pressed }) => [styles.destinationMain, { backgroundColor: pressed ? colors.accentSoft : 'transparent' }]}
                >
                  <View style={[styles.destinationIcon, { backgroundColor: isSelecting ? 'transparent' : colors.accentSoft }]}>
                    <Feather name={isSelecting ? isSelected ? 'check-square' : 'square' : destination.kind === 'rail-station' ? 'navigation' : destination.kind === 'bus-dropoff' ? 'truck' : 'map-pin'} size={isSelecting ? 23 : 18} color={isSelecting && !isSelected ? colors.muted : colors.accent} />
                  </View>
                  <View style={styles.destinationCopy}>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.destinationName, { color: colors.ink }]}>{destination.name}</Text>
                    <Text style={[styles.destinationKind, { color: colors.muted }]}>{destinationType(destination)}</Text>
                  </View>
                </Pressable>
                {!isSelecting ? <View style={styles.switchTarget}>
                  {isBusy ? <ActivityIndicator accessibilityLabel="Updating alarm" color={colors.accent} style={styles.switchBusy} /> : (
                    <Switch
                      accessibilityLabel={`Alarm for ${destination.name}`}
                      accessibilityHint="Starts or stops destination location monitoring. New alarms stay off until you turn them on."
                      disabled={!alarm || Boolean(busyAlarmId) || removing}
                      value={Boolean(alarm?.enabled)}
                      onValueChange={(enabled) => { if (guide.visible) guide.finishGuide(); if (alarm) void toggleAlarm(alarm, enabled); }}
                      trackColor={{ false: colors.switchOffTrack, true: colors.accent }}
                      thumbColor={colors.switchThumb}
                    />
                  )}
                </View> : null}
              </View>
            );
            return index === 0
              ? <GuideTarget key={destination.id} id="saved-alarms" style={styles.cardTarget}>{card}</GuideTarget>
              : <View key={destination.id}>{card}</View>;
          })}
        </View>
      )}

      {showPermissionNotice && permissionAlarm ? (
        <View style={[styles.permissionNotice, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.permissionTitle, { color: colors.warning }]}>Your alarm is still off</Text>
          <Text style={[styles.noticeText, { color: colors.muted }]}>{permissionNoticeText}</Text>
          <Pressable motion="card" accessibilityRole="button" onPress={() => { void Linking.openSettings().catch(() => setActionProblem('Phone settings could not be opened.')); }} style={[styles.settingsAction, { backgroundColor: colors.raised }]}>
            <Text style={[styles.settingsActionText, { color: colors.ink }]}>Open phone settings</Text>
            <Feather name="external-link" size={15} color={colors.accent} />
          </Pressable>
        </View>
      ) : null}

      {app.destinations.length > 0 && !app.firstRun.guideCompleted ? (
        <Pressable motion="card" accessibilityRole="button" onPress={guide.startGuide} style={({ pressed }) => [styles.quickTour, { backgroundColor: pressed ? colors.accentHoverSoft : colors.raised, borderColor: pressed ? colors.accent : 'transparent' }]}>
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
          <View style={styles.noticeCopy}>
            <Text style={[styles.noticeMessage, { color: colors.muted }]}>Location runs while an alarm or trip is active.</Text>
            <Pressable motion="compact" accessibilityRole="link" onPress={() => router.push('/legal/location-safety')} style={styles.noticeLink}>
              <Text style={[styles.noticeLinkText, { color: colors.accent }]}>How alarms work</Text>
            </Pressable>
          </View>
          <Pressable motion="compact" accessibilityRole="button" accessibilityLabel="Dismiss location notice" onPress={dismissNotice} style={styles.dismissButton}>
            <Feather name="x" size={16} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      {actionProblem ? <Text accessibilityRole="alert" style={[styles.actionProblem, { color: colors.danger }]}>{actionProblem}</Text> : null}

      <Modal
        animationType="fade"
        onRequestClose={closeRemovalDialog}
        transparent
        visible={removalIds !== null}
      >
        <View style={styles.modalRoot}>
          <Pressable motion="none" accessibilityRole="button" accessibilityLabel="Dismiss delete confirmation" disabled={removing} onPress={closeRemovalDialog} style={StyleSheet.absoluteFill} />
          {removalIds ? (
            <View accessibilityViewIsModal style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.modalHeading}>
                <View style={styles.modalHeadingCopy}>
                  <Text accessibilityRole="header" style={[styles.modalTitle, { color: colors.ink }]}>
                    Delete {pendingRemovals.length} {pendingRemovals.length === 1 ? 'alarm' : 'alarms'}?
                  </Text>
                  <Text style={[styles.modalSubtitle, { color: colors.muted }]}>
                    These saved destinations and their alarms will be removed from this device.
                  </Text>
                </View>
                <Pressable motion="compact" accessibilityRole="button" accessibilityLabel="Close delete confirmation" disabled={removing} onPress={closeRemovalDialog} style={styles.modalClose}>
                  <Feather name="x" size={19} color={colors.muted} />
                </Pressable>
              </View>
              <ScrollView style={styles.removalList} contentContainerStyle={styles.removalListContent}>
                {pendingRemovals.map((destination) => (
                  <Text key={destination.id} style={[styles.removalName, { color: colors.ink }]}>{destination.name} · {destinationType(destination)}</Text>
                ))}
              </ScrollView>
              {removalProblem ? <Text accessibilityRole="alert" style={[styles.actionProblem, { color: colors.danger }]}>{removalProblem}</Text> : null}
              <View style={styles.modalActions}>
                <Pressable accessibilityRole="button" disabled={removing || pendingRemovals.length === 0} onPress={() => void removeSelectedDestinations()} style={({ pressed }) => [styles.deleteButton, { backgroundColor: pressed ? colors.dangerHover : colors.danger, opacity: removing || pendingRemovals.length === 0 ? 0.6 : 1 }]}>
                  {removing ? <ActivityIndicator color={colors.onAccent} /> : <Feather name="trash-2" size={17} color={colors.onAccent} />}
                  <Text style={[styles.deleteButtonText, { color: colors.onAccent }]}>{removing ? 'Deleting…' : `Delete ${pendingRemovals.length === 1 ? 'alarm' : 'alarms'}`}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={removing} onPress={closeRemovalDialog} style={[styles.modalKeep, { borderColor: colors.line }]}>
                  <Text style={[styles.modalKeepText, { color: colors.ink }]}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
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
  greetingRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  greetingSpacer: { flex: 1 },
  greeting: { flex: 1, flexShrink: 1, fontSize: 12, fontWeight: '600' },
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
  addAlarmTopTarget: { flexShrink: 0 },
  primaryAction: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', gap: 8, borderRadius: 13, overflow: 'hidden' },
  primaryActionText: { fontSize: 14, fontWeight: '700' },
  alarmList: { gap: 9 },
  selectionHint: { fontSize: 12, lineHeight: 18, marginBottom: 2 },
  selectionToolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectionAction: { minHeight: 48, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12 },
  selectionActionText: { fontSize: 14, fontWeight: '600' },
  selectionFooter: { paddingBottom: 70 },
  deleteButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14 },
  deleteButtonText: { fontSize: 16, lineHeight: 22, fontWeight: '700', flexShrink: 1 },
  cardTarget: { width: '100%' },
  destinationCard: { borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  destinationMain: { flex: 1, minHeight: 84, paddingHorizontal: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  destinationIcon: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  destinationCopy: { flex: 1, gap: 4 },
  destinationKind: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  destinationName: { fontSize: 16, lineHeight: 22, fontWeight: '700', letterSpacing: -0.15 },
  switchTarget: { minWidth: 60, minHeight: 52, paddingRight: 12, alignItems: 'center', justifyContent: 'center' },
  switchBusy: { width: 48, height: 44 },
  addButton: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 13, overflow: 'hidden' },
  addButtonText: { fontSize: 14, fontWeight: '700' },
  permissionNotice: { gap: 8, padding: 12, borderRadius: 14, borderWidth: 1 },
  permissionTitle: { fontSize: 13, fontWeight: '700' },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 16 },
  settingsAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderRadius: 11 },
  settingsActionText: { fontSize: 12, fontWeight: '700' },
  quickTour: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderRadius: 14 },
  quickTourIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  notice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 11, paddingRight: 5, paddingVertical: 6, borderRadius: 12 },
  noticeCopy: { flex: 1 },
  noticeMessage: { fontSize: 11, lineHeight: 16 },
  noticeLink: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 6 },
  noticeLinkText: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  dismissButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionProblem: { fontSize: 13, lineHeight: 19 },
  modalRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(5, 12, 23, 0.68)' },
  modalCard: { width: '100%', maxWidth: 400, maxHeight: '94%', gap: 15, padding: 18, borderWidth: 1, borderRadius: 22, elevation: 20 },
  modalHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  modalHeadingCopy: { flex: 1, gap: 4, paddingTop: 1 },
  modalTitle: { fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.2 },
  modalSubtitle: { fontSize: 14, lineHeight: 20 },
  modalClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  removalList: { maxHeight: 180, flexShrink: 1 },
  removalListContent: { gap: 10 },
  removalName: { fontSize: 14, lineHeight: 20 },
  modalActions: { gap: 8 },
  modalKeep: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 14 },
  modalKeepText: { fontSize: 14, fontWeight: '700' },
});
