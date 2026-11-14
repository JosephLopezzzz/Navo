import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { NavoPressable as Pressable } from '../../components/NavoPressable';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Body, DataSeal, Divider, PrimaryButton, Screen, ScreenTitle, SecondaryButton, SectionTitle, Subtle } from '../../components/ui';
import { makeJourneyRoute, railLines } from '../../data/routes';
import { railStations, searchRailStations } from '../../data/rail-stations';
import type { AlertMode, Stop, Trip } from '../../domain/models';
import { startTripState } from '../../domain/trip-actions';
import { beginBackgroundLocation, stopBackgroundLocationIfIdle } from '../../services/background-location';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';
import { useScreenActionScope } from '../../hooks/useScreenActionScope';

type PickerMode = 'boarding' | 'destination' | null;

export default function TripSetupScreen() {
  const params = useLocalSearchParams<{ lineId?: string; routeId?: string }>();
  const app = useAppState();
  const captureAction = useScreenActionScope();
  const colors = useNavoColors();
  const route = useMemo(() => {
    if (params.routeId) return app.customBusRoutes.find((item) => item.id === params.routeId);
    return railLines.find((item) => item.id === params.lineId);
  }, [params.lineId, params.routeId, app.customBusRoutes]);
  const routeVersion = route ? JSON.stringify(route) : null;
  const [selectedStops, setSelectedStops] = useState<{ routeVersion: string | null; boarding: number; destination: number }>({ routeVersion: null, boarding: 0, destination: 1 });
  const boardingIndex = route && selectedStops.routeVersion === routeVersion ? selectedStops.boarding : 0;
  const destinationIndex = route && selectedStops.routeVersion === routeVersion ? selectedStops.destination : (route?.stops.length ?? 2) - 1;
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [stopQuery, setStopQuery] = useState('');
  const [alertModeOverride, setAlertModeOverride] = useState<AlertMode | null>(null);
  const alertMode = alertModeOverride ?? (app.settings.sleepMode ? 'destination-only' : 'every-stop');
  const [starting, setStarting] = useState(false);
  const [confirmingReplacement, setConfirmingReplacement] = useState(false);
  const [startProblem, setStartProblem] = useState<string | null>(null);
  const action = useRef<'idle' | 'confirming' | 'starting'>('idle');
  const mounted = useRef(true);
  const busy = starting || confirmingReplacement;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; action.current = 'idle'; };
  }, []);

  if (!route) {
    return (
      <Screen>
        <ScreenTitle>{app.storageProblem ? 'Saved routes unavailable' : app.ready ? 'Route not found' : 'Loading saved routes'}</ScreenTitle>
        <Subtle>{app.storageProblem ?? (app.ready ? 'It may have been removed from this device.' : 'Reading saved routes from this device.')}</Subtle>
        {app.storageProblem ? <PrimaryButton title="Retry saved routes" onPress={() => void app.refreshState()} /> : null}
        {app.ready ? <PrimaryButton title="Back to routes" onPress={() => router.replace('/routes')} /> : null}
      </Screen>
    );
  }

  const journey = makeJourneyRoute(route, boardingIndex, destinationIndex);
  const boardingStop = route.stops[boardingIndex];
  const destinationStop = route.stops[destinationIndex];
  const locationReady = journey?.coordinateStatus === 'complete' && journey.stops.every((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude));
  const stopsAfterBoarding = Math.max(0, (journey?.stops.length ?? 1) - 1);
  const station = route.mode === 'rail' ? railStations.find((item) => item.lineId === route.id && item.stopId === destinationStop?.id) : undefined;
  const matchingRailStopIds = route.mode === 'rail' ? new Set(searchRailStations(route.id, stopQuery).map((item) => item.stopId)) : null;
  const searchWords = stopQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const visibleStops = route.stops.map((stop, index) => ({ stop, index })).filter(({ stop }) => {
    if (matchingRailStopIds) return matchingRailStopIds.has(stop.id);
    const name = stop.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return searchWords.every((word) => name.includes(word));
  });

  const openPicker = (mode: Exclude<PickerMode, null>) => {
    if (action.current !== 'idle') return;
    setPickerMode((current) => current === mode ? null : mode);
    setStopQuery('');
    setStartProblem(null);
  };

  const handlePick = (index: number) => {
    if (!pickerMode || action.current !== 'idle' || !route.stops[index]) return;
    const nextBoarding = pickerMode === 'boarding' ? index : boardingIndex;
    const nextDestination = pickerMode === 'destination' ? index : destinationIndex;
    if (nextBoarding === nextDestination) {
      setStartProblem('Choose different boarding and destination stops.');
      return;
    }
    setSelectedStops({ routeVersion, boarding: nextBoarding, destination: nextDestination });
    setPickerMode(null);
    setStartProblem(null);
  };

  const commitTrip = async (expectedTripId: string | null) => {
    const isCurrent = captureAction();
    if (!journey || !boardingStop || !destinationStop || !app.ready || !isCurrent()) return;
    action.current = 'starting';
    setConfirmingReplacement(false);
    setStarting(true);
    setStartProblem(null);
    try {
      const trip: Trip = {
        id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        routeId: journey.id,
        boardingIndex: 0,
        destinationIndex: journey.stops.length - 1,
        lastConfirmedIndex: 0,
        alertMode,
        startedAt: new Date().toISOString(),
        status: 'active',
        approachedStopIds: [],
        arrivedStopIds: [],
        movingAwayCount: 0,
        directionAdvisorySent: false,
        offRouteCount: 0,
        routeDeviationSent: false,
      };
      await app.mutateState((current) => {
        if (route.mode === 'bus') {
          const currentTemplate = current.customBusRoutes.find((item) => item.id === route.id);
          if (!currentTemplate || JSON.stringify(currentTemplate) !== routeVersion) {
            throw new Error('This bus route changed or was removed. Review its stops before starting.');
          }
        }
        return startTripState(current, journey, trip, expectedTripId);
      });

      try {
        if (locationReady) await beginBackgroundLocation(app.settings);
        // Reconcile the old trip's sampling after replacement; enabled destination alarms keep their own work.
        else await stopBackgroundLocationIfIdle();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Background location setup did not finish. Review your trip status.';
        const latest = await app.mutateState((current) => current.activeTrip?.id === trip.id ? { ...current, locationProblem: message } : current).catch(() => null);
        if (isCurrent() && latest?.activeTrip?.id === trip.id) Alert.alert(locationReady ? 'Trip started in manual mode' : 'Trip saved', message, [{ text: 'Continue', onPress: () => { if (isCurrent()) router.replace('/trip/active'); } }]);
        else if (isCurrent()) router.replace('/trip/active');
        return;
      }
      if (isCurrent()) router.replace('/trip/active');
    } catch (error) {
      if (mounted.current) {
        setStartProblem(error instanceof Error ? error.message : 'Could not start this trip. Check saved data and try again.');
        void app.refreshState();
      }
    } finally {
      action.current = 'idle';
      if (mounted.current) setStarting(false);
    }
  };

  const requestStart = () => {
    const isCurrent = captureAction();
    if (!journey || !app.ready || action.current !== 'idle' || !isCurrent()) return;
    const existingTrip = app.activeTrip?.status === 'cancelled' ? null : app.activeTrip;
    if (!existingTrip) {
      void commitTrip(null);
      return;
    }
    action.current = 'confirming';
    setConfirmingReplacement(true);
    const cancel = () => {
      if (action.current !== 'confirming') return;
      action.current = 'idle';
      if (mounted.current) setConfirmingReplacement(false);
    };
    Alert.alert(existingTrip.status === 'completed' ? 'Finish your previous trip?' : 'You have a trip in progress', existingTrip.status === 'completed'
      ? 'Your arrival is saved. Finish that trip or start a new one.'
      : 'Resume your current trip or replace its saved progress with this trip.', [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: existingTrip.status === 'completed' ? 'Finish trip' : 'Resume trip', onPress: () => { cancel(); if (isCurrent()) router.replace('/trip/active'); } },
      { text: existingTrip.status === 'completed' ? 'Start new trip' : 'Replace trip', style: 'destructive', onPress: () => { if (!isCurrent()) { cancel(); return; } if (action.current === 'confirming') void commitTrip(existingTrip.id); } },
    ], { cancelable: true, onDismiss: cancel });
  };

  const createStationAlarm = () => {
    if (action.current !== 'idle') return;
    if (!station) {
      setStartProblem('This station has no saved map point. Choose another station or add a destination from Alarms.');
      return;
    }
    router.push({ pathname: '/destination/pick', params: { kind: 'rail-station', stationId: station.id } });
  };

  return (
    <Screen>
      <View style={styles.heading}>
        <ScreenTitle>{route.name}</ScreenTitle>
        <DataSeal label={route.mode === 'rail' ? 'Rail route' : 'Your bus route'} tone="neutral" />
      </View>
      <Subtle>Select your boarding stop and destination. The numbered order follows the chosen direction.</Subtle>

      <View style={styles.routePlate}>
        <View style={styles.endpointRow}>
          <View style={styles.endpoint}>
            <Subtle>BOARDING</Subtle>
            <Text style={[styles.endpointName, { color: colors.ink }]}>{boardingStop?.name}</Text>
          </View>
          <View style={[styles.routeArrow, { backgroundColor: colors.accentSoft }]}>
            <Feather name="arrow-right" size={17} color={colors.accent} />
          </View>
          <View style={[styles.endpoint, styles.destinationEnd]}>
            <Subtle>DESTINATION</Subtle>
            <Text style={[styles.endpointName, { color: colors.ink }]}>{destinationStop?.name}</Text>
          </View>
        </View>
        <View style={styles.progressHolder}>
          <View style={[styles.progressTrack, { backgroundColor: colors.line }]} />
          <View style={[styles.progressNode, { left: 0, backgroundColor: colors.accent, borderColor: colors.accent }]} />
          <View style={[styles.progressNode, { right: 0, backgroundColor: colors.surface, borderColor: colors.accent }]} />
        </View>
        <View style={styles.journeySummary}>
          <Subtle style={styles.summaryCopy}>{stopsAfterBoarding} {stopsAfterBoarding === 1 ? 'stop' : 'stops'} after boarding</Subtle>
          <Pressable motion="compact" accessibilityRole="button" accessibilityLabel="Swap boarding and destination stops" accessibilityState={{ disabled: busy || !journey }} disabled={busy || !journey} onPress={() => {
            if (action.current !== 'idle') return;
            setSelectedStops({ routeVersion, boarding: destinationIndex, destination: boardingIndex });
            setPickerMode(null);
            setStopQuery('');
            setStartProblem(null);
          }} style={[styles.swapButton, { backgroundColor: colors.accentSoft, opacity: busy || !journey ? 0.45 : 1 }]}>
            <Feather name="repeat" size={17} color={colors.accent} />
            <Text style={[styles.changeText, { color: colors.accent }]}>Swap</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.selectorRows}>
        <SelectRow title="Boarding stop" value={boardingStop?.name ?? 'Choose a stop'} disabled={busy} onPress={() => openPicker('boarding')} />
        <Divider />
        <SelectRow title="Destination" value={destinationStop?.name ?? 'Choose a stop'} disabled={busy} onPress={() => openPicker('destination')} />
      </View>

      {pickerMode && (
        <View style={styles.stopPicker}>
          <SectionTitle>{pickerMode === 'boarding' ? 'Boarding stop' : 'Destination'}</SectionTitle>
          <TextInput accessibilityLabel={route.mode === 'rail' ? 'Search stations on this line' : 'Search stops on this route'} editable={!busy} value={stopQuery} onChangeText={setStopQuery} autoCorrect={false} autoCapitalize="words" placeholder={route.mode === 'rail' ? 'Search station names or aliases' : 'Search stop names'} placeholderTextColor={colors.quiet} style={[styles.stopSearch, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line }]} returnKeyType="search" />
          <Subtle style={styles.pickerHint}>{pickerMode === 'boarding' ? 'Your destination is unavailable as a boarding stop.' : 'Your boarding stop is unavailable as a destination.'}</Subtle>
          {visibleStops.length === 0 ? <Subtle>No stops match “{stopQuery.trim()}” on {route.name}.</Subtle> : null}
          {visibleStops.map(({ stop, index }) => {
            const selected = pickerMode === 'boarding' ? index === boardingIndex : index === destinationIndex;
            const disabled = busy || (pickerMode === 'boarding' ? index === destinationIndex : index === boardingIndex);
            return <StopOption key={stop.id} stop={stop} index={index} selected={selected} disabled={disabled} mode={pickerMode} onPress={() => handlePick(index)} />;
          })}
        </View>
      )}

      <View style={styles.sourceBlock}>
        <DataSeal label={locationReady ? 'Rider-saved stop locations' : 'Manual stop progress'} tone={locationReady ? 'success' : 'neutral'} />
        <Subtle>{route.sourceLabel}</Subtle>
        {!locationReady && <Subtle>Confirm each stop yourself during this trip. Automatic arrival alerts are off; use a separate destination alarm for an arrival reminder.</Subtle>}
        {route.mode === 'rail' ? <Pressable accessibilityRole="button" accessibilityLabel={`Create alarm for ${destinationStop?.name ?? 'this station'}`} accessibilityState={{ disabled: busy || !app.ready || !destinationStop }} disabled={busy || !app.ready || !destinationStop} onPress={createStationAlarm} style={[styles.stationAlarm, { opacity: busy ? 0.45 : 1 }]}>
          <Feather name="bell" size={17} color={colors.accent} />
          <Text style={[styles.changeText, styles.summaryCopy, { color: colors.accent }]}>Create alarm for this station</Text>
          <Feather name="arrow-right" size={17} color={colors.accent} />
        </Pressable> : null}
      </View>

      {locationReady && <View style={styles.alertModeRow}>
        <View style={styles.alertModeCopy}>
          <Body>Sleep mode</Body>
          <Subtle>{alertMode === 'destination-only' ? 'Alert only near your destination.' : 'Alert near each upcoming stop.'}</Subtle>
        </View>
        <Switch accessibilityLabel="Sleep mode, destination only" disabled={busy} value={alertMode === 'destination-only'} onValueChange={(sleep) => setAlertModeOverride(sleep ? 'destination-only' : 'every-stop')} trackColor={{ false: colors.switchOffTrack, true: colors.accent }} thumbColor={colors.switchThumb} />
      </View>}

      {startProblem || app.storageProblem ? <Text accessibilityRole="alert" style={[styles.problemText, { color: colors.danger }]}>{startProblem ?? app.storageProblem}</Text> : null}
      {app.storageProblem ? <SecondaryButton title="Retry saved data" onPress={() => void app.refreshState()} disabled={busy} /> : null}
      <PrimaryButton title={starting ? 'Starting trip…' : confirmingReplacement ? 'Review current trip…' : locationReady ? 'Start route trip' : 'Start manual trip'} onPress={requestStart} disabled={!app.ready || !journey || busy} />
    </Screen>
  );
}

function SelectRow({ title, value, disabled, onPress }: { title: string; value: string; disabled: boolean; onPress: () => void }) {
  const colors = useNavoColors();
  return (
    <Pressable motion="card" accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.selectRow, { opacity: disabled ? 0.45 : 1 }]}>
      <View style={styles.selectCopy}>
        <Text style={[styles.selectLabel, { color: colors.muted }]}>{title}</Text>
        <Text style={[styles.selectValue, { color: colors.ink }]}>{value}</Text>
      </View>
      <Text style={[styles.changeText, { color: colors.accent }]}>Change</Text>
    </Pressable>
  );
}

function StopOption({ stop, index, selected, disabled, mode, onPress }: { stop: Stop; index: number; selected: boolean; disabled: boolean; mode: Exclude<PickerMode, null>; onPress: () => void }) {
  const colors = useNavoColors();
  return (
    <Pressable motion="card"
      accessibilityRole="button"
      accessibilityLabel={mode === 'boarding' ? 'Board at ' + stop.name : 'Set destination to ' + stop.name}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.stopOption, { borderBottomColor: colors.line, opacity: disabled ? 0.42 : 1, backgroundColor: selected ? colors.accentSoft : 'transparent' }]}
    >
      <Text style={[styles.stopIndex, { color: selected ? colors.accent : colors.muted }]}>{String(index + 1).padStart(2, '0')}</Text>
      <Text style={[styles.stopName, { color: colors.ink }]}>{stop.name}</Text>
      {selected && <Text style={[styles.selectedText, { color: colors.accent }]}>Selected</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  routePlate: { paddingVertical: 17, gap: 15 },
  endpointRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 9 },
  endpoint: { flex: 1, gap: 5 },
  destinationEnd: { alignItems: 'flex-end' },
  endpointName: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, textAlign: 'left' },
  routeArrow: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  progressHolder: { height: 12, justifyContent: 'center', marginHorizontal: 4 },
  progressTrack: { position: 'absolute', height: 2, width: '100%' },
  progressNode: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  selectorRows: { gap: 0 },
  selectRow: { minHeight: 63, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  selectCopy: { flex: 1, gap: 4 },
  selectLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.35, textTransform: 'uppercase' },
  selectValue: { fontSize: 16, fontWeight: '600' },
  changeText: { fontSize: 14, fontWeight: '700' },
  stopPicker: { paddingTop: 6, gap: 0 },
  stopSearch: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, marginTop: 10 },
  pickerHint: { fontSize: 12, lineHeight: 17, paddingVertical: 10 },
  stopOption: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  stopIndex: { width: 28, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stopName: { flex: 1, fontSize: 15, fontWeight: '500' },
  selectedText: { fontSize: 12, fontWeight: '700' },
  sourceBlock: { gap: 10, paddingVertical: 5 },
  alertModeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  alertModeCopy: { flex: 1, gap: 4 },
  journeySummary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryCopy: { flex: 1 },
  swapButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 11 },
  stationAlarm: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10 },
  problemText: { fontSize: 14, lineHeight: 20 },
});
