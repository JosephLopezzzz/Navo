import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Body, DataSeal, Divider, PrimaryButton, Screen, ScreenTitle, SectionTitle, Subtle } from '../../components/ui';
import { makeJourneyRoute, railLines } from '../../data/routes';
import type { AlertMode, Stop, Trip } from '../../domain/models';
import { beginBackgroundLocation, endBackgroundLocation } from '../../services/background-location';
import { readAppState, writeAppState } from '../../services/storage';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

type PickerMode = 'boarding' | 'destination' | null;

export default function TripSetupScreen() {
  const params = useLocalSearchParams<{ lineId?: string; routeId?: string }>();
  const app = useAppState();
  const colors = useNavoColors();
  const route = useMemo(() => {
    if (params.routeId) return app.customBusRoutes.find((item) => item.id === params.routeId);
    return railLines.find((item) => item.id === params.lineId);
  }, [params.lineId, params.routeId, app.customBusRoutes]);
  const [selectedStops, setSelectedStops] = useState<{ routeId: string | null; boarding: number; destination: number }>({ routeId: null, boarding: 0, destination: 1 });
  const boardingIndex = route && selectedStops.routeId === route.id ? selectedStops.boarding : 0;
  const destinationIndex = route && selectedStops.routeId === route.id ? selectedStops.destination : (route?.stops.length ?? 2) - 1;
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [alertModeOverride, setAlertModeOverride] = useState<AlertMode | null>(null);
  const alertMode = alertModeOverride ?? (app.settings.sleepMode ? 'destination-only' : 'every-stop');
  const [starting, setStarting] = useState(false);

  if (!route) {
    return (
      <Screen>
        <ScreenTitle>{app.ready ? 'Route not found' : 'Loading saved routes'}</ScreenTitle>
        <Subtle>{app.storageProblem ?? (app.ready ? 'It may have been removed from this device.' : 'Reading saved routes from this device.')}</Subtle>
        {app.storageProblem ? <PrimaryButton title="Retry saved routes" onPress={() => void app.refreshState()} /> : null}
        {app.ready ? <PrimaryButton title="Back to routes" onPress={() => router.replace('/routes')} /> : null}
      </Screen>
    );
  }

  const journey = makeJourneyRoute(route, boardingIndex, destinationIndex);
  const boardingStop = route.stops[boardingIndex];
  const destinationStop = route.stops[destinationIndex];

  const handlePick = (index: number) => {
    if (!pickerMode) return;
    let nextBoarding = boardingIndex;
    let nextDestination = destinationIndex;
    if (pickerMode === 'boarding') nextBoarding = index;
    else nextDestination = index;
    if (nextBoarding === nextDestination) {
      nextDestination = nextBoarding < route.stops.length - 1 ? nextBoarding + 1 : nextBoarding - 1;
    }
    setSelectedStops({ routeId: route.id, boarding: nextBoarding, destination: nextDestination });
    setPickerMode(null);
  };

  const startTrip = async () => {
    if (!journey || !boardingStop || !destinationStop || starting || !app.ready) return;
    setStarting(true);
    try {
      const trip: Trip = {
        id: 'trip-' + Date.now(),
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
      const stored = await readAppState();
      const locationReady = journey.coordinateStatus === 'complete' && journey.stops.every((stop) => stop.latitude !== undefined && stop.longitude !== undefined);
      let nextState = {
        ...stored,
        activeTrip: trip,
        activeRoute: journey,
        settings: { ...stored.settings, sleepMode: alertMode === 'destination-only' },
        lastLocationAt: null,
        lastLocation: null,
        lastLocationAccuracyM: null,
        lastTripNotice: null,
        locationProblem: locationReady ? null : 'This route has no verified location points. Use manual stop confirmation.',
      };
      await endBackgroundLocation();
      await writeAppState(nextState);
      app.updateState(nextState);

      if (locationReady) {
        try {
          await beginBackgroundLocation(stored.settings);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Location alert setup did not finish.';
          nextState = { ...nextState, locationProblem: message };
          await writeAppState(nextState);
          app.updateState(nextState);
          Alert.alert('Trip started in manual mode', message, [{ text: 'Continue', onPress: () => router.replace('/trip/active') }]);
          return;
        }
      }
      router.replace('/trip/active');
    } catch (error) {
      Alert.alert('Could not start this trip', error instanceof Error ? error.message : 'Check saved data and try again.');
    } finally {
      setStarting(false);
    }
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
          <View style={[styles.progressFill, { backgroundColor: colors.accent, width: '54%' }]} />
          <View style={[styles.progressNode, { left: 0, backgroundColor: colors.accent, borderColor: colors.accent }]} />
          <View style={[styles.progressNode, { right: 0, backgroundColor: colors.surface, borderColor: colors.accent }]} />
        </View>
        <Subtle>{journey?.stops.length ?? 0} stops in this sequence</Subtle>
      </View>

      <View style={styles.selectorRows}>
        <SelectRow title="Boarding stop" value={boardingStop?.name ?? 'Choose a stop'} onPress={() => setPickerMode((current) => current === 'boarding' ? null : 'boarding')} />
        <Divider />
        <SelectRow title="Destination" value={destinationStop?.name ?? 'Choose a stop'} onPress={() => setPickerMode((current) => current === 'destination' ? null : 'destination')} />
      </View>

      {pickerMode && (
        <View style={styles.stopPicker}>
          <SectionTitle>{pickerMode === 'boarding' ? 'Boarding stop' : 'Destination'}</SectionTitle>
          {route.stops.map((stop, index) => {
            const selected = pickerMode === 'boarding' ? index === boardingIndex : index === destinationIndex;
            const disabled = pickerMode === 'destination' && index === boardingIndex;
            return <StopOption key={stop.id} stop={stop} index={index} selected={selected} disabled={disabled} mode={pickerMode} onPress={() => handlePick(index)} />;
          })}
        </View>
      )}

      <View style={styles.sourceBlock}>
        <DataSeal label={route.coordinateStatus === 'complete' ? 'Rider-saved stop locations' : 'Station coordinates missing'} tone={route.coordinateStatus === 'complete' ? 'success' : 'warning'} />
        <Subtle>{route.sourceLabel}</Subtle>
        {route.coordinateStatus !== 'complete' && <Subtle>Location alerts cannot run for this route yet. You can still follow the order and confirm each stop manually.</Subtle>}
      </View>

      <View style={styles.alertModeRow}>
        <View style={styles.alertModeCopy}>
          <Body>Sleep mode</Body>
          <Subtle>{alertMode === 'destination-only' ? 'Alert only near your destination.' : 'Alert near each upcoming stop.'}</Subtle>
        </View>
        <Switch accessibilityLabel="Sleep mode, destination only" value={alertMode === 'destination-only'} onValueChange={(sleep) => setAlertModeOverride(sleep ? 'destination-only' : 'every-stop')} trackColor={{ true: colors.accent }} />
      </View>

      <PrimaryButton title={starting ? 'Starting trip…' : 'Start destination alarm'} onPress={() => void startTrip()} disabled={!app.ready || !journey || starting} />
    </Screen>
  );
}

function SelectRow({ title, value, onPress }: { title: string; value: string; onPress: () => void }) {
  const colors = useNavoColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.selectRow}>
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
    <Pressable
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
  progressFill: { position: 'absolute', left: 0, height: 2 },
  progressNode: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  selectorRows: { gap: 0 },
  selectRow: { minHeight: 63, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  selectCopy: { flex: 1, gap: 4 },
  selectLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.35, textTransform: 'uppercase' },
  selectValue: { fontSize: 16, fontWeight: '600' },
  changeText: { fontSize: 14, fontWeight: '700' },
  stopPicker: { paddingTop: 6, gap: 0 },
  stopOption: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  stopIndex: { width: 28, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stopName: { flex: 1, fontSize: 15, fontWeight: '500' },
  selectedText: { fontSize: 12, fontWeight: '700' },
  sourceBlock: { gap: 10, paddingVertical: 5 },
  alertModeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  alertModeCopy: { flex: 1, gap: 4 },
});