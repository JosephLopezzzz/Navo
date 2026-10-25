import { useCallback } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { DataSeal, Divider, PrimaryButton, RouteLine, Screen, ScreenTitle, SecondaryButton, Subtle } from '../../components/ui';
import { distanceBetweenMeters, manuallyConfirmNextStop } from '../../domain/trip-engine';
import { stopBackgroundLocationIfIdle } from '../../services/background-location';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

export default function ActiveTripScreen() {
  const colors = useNavoColors();
  const app = useAppState();
  const refreshState = app.refreshState;
  useFocusEffect(useCallback(() => {
    void refreshState();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refreshState(); });
    return () => subscription.remove();
  }, [refreshState]));

  const trip = app.activeTrip;
  const route = app.activeRoute;
  if (!trip || !route) {
    return (
      <Screen>
        <ScreenTitle>No active trip</ScreenTitle>
        <Subtle>Choose a route and destination to set up a trip.</Subtle>
        <PrimaryButton title="Choose a route" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const nextIndex = Math.min(trip.lastConfirmedIndex + 1, trip.destinationIndex);
  const nextStop = route.stops[nextIndex];
  const destination = route.stops[trip.destinationIndex];
  const routeHasLocations = route.coordinateStatus === 'complete' && route.stops.every((stop) => stop.latitude !== undefined && stop.longitude !== undefined);
  const metersToNext = app.lastLocation && nextStop?.latitude !== undefined && nextStop.longitude !== undefined
    ? distanceBetweenMeters(app.lastLocation, { latitude: nextStop.latitude, longitude: nextStop.longitude })
    : null;
  const fixTime = app.lastLocationAt === null ? null : new Date(app.lastLocationAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fixLabel = fixTime === null
    ? 'Waiting for a location fix.'
    : 'Last location check at ' + fixTime + ' · ±' + Math.round(app.lastLocationAccuracyM ?? 0) + ' m accuracy.';
  const passed = trip.lastConfirmedIndex;

  const confirmNext = async () => {
    const outcome: { result: ReturnType<typeof manuallyConfirmNextStop> | null } = { result: null };
    await app.mutateState((current) => {
      if (!current.activeTrip || current.activeTrip.id !== trip.id || !current.activeRoute) return current;
      outcome.result = manuallyConfirmNextStop(current.activeRoute, current.activeTrip);
      return { ...current, activeTrip: outcome.result.trip };
    });
    const result = outcome.result;
    if (!result) return;
    const event = result.events[0];
    if (result.trip.status === 'completed') {
      await stopBackgroundLocationIfIdle();
      if (event) {
        const permission = await Notifications.getPermissionsAsync();
        if (permission.granted) {
          await Notifications.scheduleNotificationAsync({ content: { title: 'Your stop is here', body: event.message, sound: true }, trigger: null });
        }
      }
    }
  };

  const clearTrip = async () => {
    await app.mutateState((current) => ({ ...current, activeTrip: null, activeRoute: null, locationProblem: null, lastTripNotice: null }));
    await stopBackgroundLocationIfIdle();
    router.replace('/');
  };

  const askToEnd = () => Alert.alert('End this trip?', 'Navo will stop checking your location for this trip.', [
    { text: 'Keep trip', style: 'cancel' },
    { text: 'End trip', style: 'destructive', onPress: () => { void clearTrip(); } },
  ]);

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
          <Subtle>Trip location checks have stopped. You can finish and choose another route.</Subtle>
        </View>
        <PrimaryButton title="Finish trip" onPress={() => void clearTrip()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.brand}>
        <Text style={[styles.wordmark, { color: colors.ink }]}>Navo</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="End trip" onPress={askToEnd} hitSlop={10} style={styles.endButton}>
          <Feather name="x" size={21} color={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.destinationBlock}>
        <Subtle>YOUR DESTINATION</Subtle>
        <ScreenTitle>{destination?.name}</ScreenTitle>
        <View style={styles.sealRow}>
          <DataSeal label={route.name} tone="neutral" />
          <DataSeal label={trip.alertMode === 'destination-only' ? 'Sleep mode' : 'Every stop'} tone="success" />
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
        <DataSeal label={routeHasLocations ? 'Rider-saved points' : 'Station order only'} tone={routeHasLocations ? 'success' : 'warning'} />
        {!routeHasLocations && <Subtle>Automatic location alerts are unavailable on this rail route because station coordinates have not been checked. Use the manual progress button.</Subtle>}
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

      <PrimaryButton title={nextStop && nextIndex === trip.destinationIndex ? 'Confirm destination reached' : `Confirm ${nextStop?.name ?? 'next stop'} reached`} onPress={() => void confirmNext()} />
      <SecondaryButton title="End trip" onPress={askToEnd} />
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
});
