import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, View } from 'react-native';
import { NavoPressable as Pressable } from '../../components/NavoPressable';
import { router, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Notifications from 'expo-notifications';
import { DataSeal, Divider, PrimaryButton, RouteLine, Screen, ScreenTitle, SecondaryButton, Subtle } from '../../components/ui';
import { distanceBetweenMeters } from '../../domain/trip-engine';
import { clearTripState, confirmTripStop } from '../../domain/trip-actions';
import type { EvaluationResult } from '../../domain/models';
import { stopBackgroundLocationIfIdle } from '../../services/background-location';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';
import { useLiveLocation } from '../../state/live-location';
import { readAppState } from '../../services/storage';
import { useScreenActionScope } from '../../hooks/useScreenActionScope';

export default function ActiveTripScreen() {
  const colors = useNavoColors();
  const app = useAppState();
  const captureAction = useScreenActionScope();
  const liveLocation = useLiveLocation();
  const refreshState = app.refreshState;
  const actionPending = useRef(false);
  const endDialogOpen = useRef(false);
  const mounted = useRef(true);
  const [pendingAction, setPendingAction] = useState<'confirm' | 'clear' | null>(null);
  const [actionProblem, setActionProblem] = useState<{ tripId: string; message: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useFocusEffect(useCallback(() => {
    void refreshState();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refreshState(); });
    return () => subscription.remove();
  }, [refreshState]));

  const trip = app.activeTrip;
  const route = app.activeRoute;
  if (!app.ready) {
    return (
      <Screen>
        <ScreenTitle>{app.storageProblem ? 'Saved trip unavailable' : 'Loading your trip'}</ScreenTitle>
        <Subtle>{app.storageProblem ?? 'Reading saved progress from this device.'}</Subtle>
        {app.storageProblem ? <PrimaryButton title="Retry saved trip" onPress={() => void refreshState()} /> : null}
      </Screen>
    );
  }
  if (!trip || !route) {
    return (
      <Screen>
        <ScreenTitle>No active trip</ScreenTitle>
        <Subtle>Choose a route and destination to set up a trip.</Subtle>
        {app.storageProblem ? <><Text accessibilityRole="alert" style={[styles.actionProblem, { color: colors.danger }]}>{app.storageProblem}</Text><SecondaryButton title="Retry saved trip" onPress={() => void refreshState()} /></> : null}
        <PrimaryButton title="Choose a route" onPress={() => router.replace('/routes')} />
      </Screen>
    );
  }

  const nextIndex = Math.min(trip.lastConfirmedIndex + 1, trip.destinationIndex);
  const nextStop = route.stops[nextIndex];
  const destination = route.stops[trip.destinationIndex];
  const routeHasLocations = route.coordinateStatus === 'complete' && route.stops.every((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude));
  const metersToNext = liveLocation.location && nextStop?.latitude !== undefined && nextStop.longitude !== undefined
    ? distanceBetweenMeters(liveLocation.location, { latitude: nextStop.latitude, longitude: nextStop.longitude })
    : null;
  const fixTime = liveLocation.locationAt === null ? null : new Date(liveLocation.locationAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fixLabel = fixTime === null
    ? 'Waiting for a location fix.'
    : 'Last location check at ' + fixTime + ' · ±' + Math.round(liveLocation.accuracyM ?? 0) + ' m accuracy.';
  const passed = trip.lastConfirmedIndex;
  const problemMessage = (actionProblem?.tripId === trip.id ? actionProblem.message : null) ?? app.storageProblem;
  const reportProblem = (tripId: string, message: string) => {
    if (mounted.current) setActionProblem({ tripId, message });
  };

  const confirmNext = async () => {
    const isCurrent = captureAction();
    if (actionPending.current || !isCurrent()) return;
    actionPending.current = true;
    setPendingAction('confirm');
    setActionProblem(null);
    try {
      const outcome: { result: EvaluationResult | null } = { result: null };
      const latest = await app.mutateState((current) => {
        const confirmed = confirmTripStop(current, trip.id, trip.lastConfirmedIndex);
        outcome.result = confirmed.result;
        return confirmed.state;
      });
      const result = outcome.result;
      if (!result) {
        if (latest.activeTrip) reportProblem(latest.activeTrip.id, 'Trip progress changed. Review the next stop before confirming again.');
        return;
      }
      if (result.trip.status === 'completed') {
        try {
          await stopBackgroundLocationIfIdle();
        } catch {
          reportProblem(trip.id, 'Your destination was saved as reached. Location cleanup did not finish; Finish trip will retry it.');
        }
        const event = result.events[0];
        if (event) {
          try {
            const permission = await Notifications.getPermissionsAsync();
            const current = await readAppState();
            if (permission.granted && current.activeTrip?.id === trip.id && current.activeTrip.status === 'completed') {
              const identifier = await Notifications.scheduleNotificationAsync({ identifier: `navo-manual-arrival-${trip.id}`, content: { title: 'Your stop is here', body: event.message, sound: true }, trigger: null });
              const afterDelivery = await readAppState();
              if (afterDelivery.activeTrip?.id !== trip.id || afterDelivery.activeTrip.status !== 'completed') {
                await Notifications.dismissNotificationAsync(identifier);
              }
            }
          } catch {
            reportProblem(trip.id, 'Your destination was saved as reached, but the arrival notification could not finish.');
          }
        }
      }
    } catch {
      await refreshState();
      reportProblem(trip.id, 'Navo could not confirm the stop save. Review your progress and try again.');
    } finally {
      actionPending.current = false;
      if (mounted.current) setPendingAction(null);
    }
  };

  const clearTrip = async (expectedTripId = trip.id) => {
    const isCurrent = captureAction();
    if (actionPending.current || !isCurrent()) return;
    actionPending.current = true;
    setPendingAction('clear');
    setActionProblem(null);
    try {
      const latest = await app.mutateState((current) => clearTripState(current, expectedTripId));
      if (latest.activeTrip) {
        reportProblem(latest.activeTrip.id, 'Your current trip changed. It has been kept.');
        return;
      }
      try {
        await stopBackgroundLocationIfIdle();
      } catch {
        if (isCurrent()) Alert.alert('Trip ended', 'Your trip progress was cleared, but location cleanup did not finish. Reopen Navo to retry location setup.');
      }
      if (isCurrent()) router.replace('/routes');
    } catch {
      await refreshState();
      reportProblem(expectedTripId, 'Navo could not confirm that this trip finished. Review your progress and try again.');
    } finally {
      actionPending.current = false;
      if (mounted.current) setPendingAction(null);
    }
  };

  const askToEnd = () => {
    const isCurrent = captureAction();
    if (actionPending.current || endDialogOpen.current || !isCurrent()) return;
    endDialogOpen.current = true;
    const expectedTripId = trip.id;
    Alert.alert('End this trip?', routeHasLocations ? 'Navo will stop checking your location for this trip.' : 'Your manual stop progress will be cleared.', [
      { text: 'Keep trip', style: 'cancel', onPress: () => { endDialogOpen.current = false; } },
      { text: 'End trip', style: 'destructive', onPress: () => { endDialogOpen.current = false; if (isCurrent()) void clearTrip(expectedTripId); } },
    ], { cancelable: true, onDismiss: () => { endDialogOpen.current = false; } });
  };

  if (trip.status === 'completed') {
    return (
      <Screen>
        <View style={styles.brand}>
          <Text style={[styles.wordmark, { color: colors.ink }]}>Navo</Text>
          <DataSeal label="Arrived" tone="success" />
        </View>
        <View style={styles.arrivedBlock}>
          <View style={[styles.arrivedMark, { backgroundColor: colors.successSoft }]}><Feather name="check" size={25} color={colors.success} /></View>
          <ScreenTitle>You&apos;ve reached {destination?.name}</ScreenTitle>
          <Subtle>{routeHasLocations ? 'Trip location checks have stopped.' : 'You marked this destination as reached.'} Finish your trip to return to Routes.</Subtle>
        </View>
        {problemMessage ? <Text accessibilityRole="alert" style={[styles.actionProblem, { color: colors.danger }]}>{problemMessage}</Text> : null}
        {app.storageProblem ? <SecondaryButton title="Retry saved trip" onPress={() => void refreshState()} disabled={pendingAction !== null} /> : null}
        <PrimaryButton title={pendingAction === 'clear' ? 'Finishing trip…' : 'Finish trip'} onPress={() => void clearTrip()} disabled={pendingAction !== null} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.brand}>
        <Text style={[styles.wordmark, { color: colors.ink }]}>Navo</Text>
        <Pressable motion="compact" accessibilityRole="button" accessibilityLabel="End trip" onPress={askToEnd} disabled={pendingAction !== null} hitSlop={10} style={styles.endButton}>
          <Feather name="x" size={21} color={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.destinationBlock}>
        <Subtle>YOUR DESTINATION</Subtle>
        <ScreenTitle>{destination?.name}</ScreenTitle>
        <View style={styles.sealRow}>
          <DataSeal label={route.name} tone="neutral" />
          <DataSeal label={routeHasLocations ? trip.alertMode === 'destination-only' ? 'Sleep mode' : 'Every stop' : 'Manual progress'} tone={routeHasLocations ? 'success' : 'neutral'} />
        </View>
      </View>

      <View style={styles.progressBlock}>
        <View style={styles.progressTextRow}>
          <Subtle>ROUTE PROGRESS</Subtle>
          <Text style={[styles.progressValue, { color: colors.ink }]}>{Math.min(passed + 1, trip.destinationIndex + 1)} of {trip.destinationIndex + 1}</Text>
        </View>
        <RouteLine passed={passed} total={trip.destinationIndex + 1} destinationLabel={destination?.name} signatureGradient />
        <View style={styles.nextBlock}>
          <Subtle>{nextIndex === trip.destinationIndex ? 'NEXT STOP · DESTINATION' : 'NEXT STOP'}</Subtle>
          <Text style={[styles.nextStop, { color: colors.ink }]}>{nextStop?.name ?? 'Destination reached'}</Text>
          {metersToNext !== null && <Subtle>About {Math.round(metersToNext / 50) * 50} m away · straight-line GPS estimate</Subtle>}
        </View>
      </View>

      <View style={styles.reliabilityBlock}>
        <DataSeal label={routeHasLocations ? 'Rider-saved points' : 'Manual stop progress'} tone={routeHasLocations ? 'success' : 'neutral'} />
        {!routeHasLocations && <Subtle>This trip follows stop order. Confirm each stop below; automatic arrival alerts are off for this trip.</Subtle>}
        {app.locationProblem && <Subtle>{app.locationProblem}</Subtle>}
        {routeHasLocations && (
          <Subtle>{fixLabel}</Subtle>
        )}
        {app.lastTripNotice && (
          <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
            <DataSeal label="Check your direction" tone="warning" />
            <Subtle>{app.lastTripNotice}</Subtle>
          </View>
        )}
        <Subtle>No ETA is shown. GPS and notification delivery may pause or be delayed by your phone.</Subtle>
      </View>

      <View style={styles.stopSequence}>
        <View style={styles.progressTextRow}>
          <Text style={[styles.sequenceHeading, { color: colors.ink }]}>Stop sequence</Text>
          <Text style={[styles.fixAgeLabel, { color: colors.muted }]}>{fixTime === null ? 'Manual ready' : 'Progress saved'}</Text>
        </View>
        <Divider />
        {route.stops.slice(0, trip.destinationIndex + 1).map((stop, index) => (
          <View key={stop.id} style={styles.stopRow}>
            <View style={styles.stopIndexCol}>
              <View style={[styles.stopMarker, { backgroundColor: index <= passed ? colors.accent : colors.surface, borderColor: index === nextIndex ? colors.accent : colors.quiet }]} />
              {index < trip.destinationIndex && <View style={[styles.stopConnector, { backgroundColor: index < passed ? colors.accent : colors.line }]} />}
            </View>
            <Text style={[styles.stopName, { color: index === nextIndex || index === trip.destinationIndex ? colors.ink : colors.muted, fontWeight: index === nextIndex ? '700' : '500' }]}>{stop.name}</Text>
            {index === trip.destinationIndex && <Text style={[styles.stopTag, { color: colors.accent }]}>DESTINATION</Text>}
          </View>
        ))}
      </View>

      {problemMessage ? <Text accessibilityRole="alert" style={[styles.actionProblem, { color: colors.danger }]}>{problemMessage}</Text> : null}
      {app.storageProblem ? <SecondaryButton title="Retry saved trip" onPress={() => void refreshState()} disabled={pendingAction !== null} /> : null}
      <PrimaryButton title={pendingAction === 'confirm' ? 'Saving progress…' : nextStop && nextIndex === trip.destinationIndex ? 'Confirm destination reached' : `Confirm ${nextStop?.name ?? 'next stop'} reached`} onPress={() => void confirmNext()} disabled={pendingAction !== null} />
      <SecondaryButton title={pendingAction === 'clear' ? 'Ending trip…' : 'End trip'} onPress={askToEnd} disabled={pendingAction !== null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { minHeight: 46, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  endButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  destinationBlock: { gap: 10, paddingTop: 8 },
  sealRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  progressBlock: { gap: 11, paddingTop: 3 },
  progressTextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressValue: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  nextBlock: { paddingTop: 5, gap: 5 },
  nextStop: { fontSize: 23, lineHeight: 29, fontWeight: '700', letterSpacing: -0.4 },
  reliabilityBlock: { gap: 10 },
  notice: { padding: 12, borderRadius: 12, gap: 8 },
  stopSequence: { gap: 0 },
  sequenceHeading: { fontSize: 17, fontWeight: '700' },
  fixAgeLabel: { fontSize: 12, fontWeight: '600' },
  stopRow: { flexDirection: 'row', minHeight: 42, alignItems: 'center', gap: 11 },
  stopIndexCol: { width: 17, height: 42, alignItems: 'center' },
  stopMarker: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 7 },
  stopConnector: { position: 'absolute', width: 2, height: 30, top: 18 },
  stopName: { flex: 1, fontSize: 14 },
  stopTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  arrivedBlock: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', gap: 15, paddingVertical: 24 },
  arrivedMark: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  actionProblem: { fontSize: 14, lineHeight: 20 },
});
