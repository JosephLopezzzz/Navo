import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { NavoPressable as Pressable } from '../../components/NavoPressable';
import Feather from '@expo/vector-icons/Feather';
import { Body, DataSeal, PrimaryButton, Screen, ScreenTitle, SectionTitle, Subtle } from '../../components/ui';
import type { TransitRoute } from '../../domain/models';
import { buildBusRoute, isBusRouteInUse, upsertBusRoute } from '../../domain/bus-routes';
import { recordCurrentStop } from '../../services/background-location';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

interface StopDraft { id: string; name: string; latitude?: number; longitude?: number }
const newDraft = (name = ''): StopDraft => ({ id: `bus-stop-${Date.now()}-${Math.random().toString(16).slice(2)}`, name });

export default function BusRouteScreen() {
  const app = useAppState();
  const params = useLocalSearchParams<{ routeId?: string }>();
  const routeId = typeof params.routeId === 'string' ? params.routeId : undefined;
  if (!app.ready) {
    return (
      <Screen>
        <ScreenTitle>Loading saved routes</ScreenTitle>
        <Subtle>{app.storageProblem ?? 'Reading saved routes from this device.'}</Subtle>
        {app.storageProblem ? <PrimaryButton title="Retry saved routes" onPress={() => void app.refreshState()} /> : null}
      </Screen>
    );
  }
  return <BusRouteForm key={routeId ?? 'new'} routeId={routeId} initialRoute={app.customBusRoutes.find((route) => route.id === routeId)} />;
}

function BusRouteForm({ routeId, initialRoute }: { routeId?: string; initialRoute?: TransitRoute }) {
  const colors = useNavoColors();
  const app = useAppState();
  // Capture the edit baseline once, so a refresh cannot replace an unsaved draft.
  const [originalRoute] = useState(initialRoute ?? null);
  const [draftRouteId] = useState(() => routeId ?? `bus-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const [routeName, setRouteName] = useState(initialRoute?.name ?? 'My bus route');
  const [stops, setStops] = useState<StopDraft[]>(() => initialRoute?.stops.map((stop) => ({ ...stop })) ?? [newDraft(), newDraft()]);
  const [busyStop, setBusyStop] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const operation = useRef<'save' | 'capture' | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const busy = saving || busyStop !== null;

  if (routeId && !originalRoute) {
    return (
      <Screen>
        <ScreenTitle>Route not found</ScreenTitle>
        <Subtle>It may have been removed from this device.</Subtle>
        <PrimaryButton title="Back to routes" onPress={() => router.replace('/routes')} />
      </Screen>
    );
  }

  const changeStops = (change: (current: StopDraft[]) => StopDraft[]) => {
    if (operation.current) return;
    setProblem(null);
    setStops(change);
  };
  const recordLocation = async (stop: StopDraft) => {
    if (operation.current) return;
    operation.current = 'capture';
    setProblem(null);
    setBusyStop(stop.id);
    try {
      const point = await recordCurrentStop();
      if (mounted.current) setStops((current) => current.map((item) => item.id === stop.id ? { ...item, ...point } : item));
    } catch (error) {
      if (mounted.current) setProblem(error instanceof Error ? error.message : 'Could not save this location. Try again while you are at the stop.');
    } finally {
      operation.current = null;
      if (mounted.current) setBusyStop(null);
    }
  };

  const saveRoute = async () => {
    if (operation.current || !app.ready) return;
    operation.current = 'save';
    setSaving(true);
    setProblem(null);
    try {
      const route = buildBusRoute(draftRouteId, routeName, stops);
      await app.mutateState((current) => upsertBusRoute(current, route, originalRoute));
      if (mounted.current) {
        if (originalRoute) router.replace('/routes');
        else router.replace({ pathname: '/trip/setup', params: { routeId: route.id } });
      }
    } catch (error) {
      if (mounted.current) setProblem(error instanceof Error ? error.message : 'Navo could not save this route. Your draft is still here. Try again.');
    } finally {
      operation.current = null;
      if (mounted.current) setSaving(false);
    }
  };

  const moveStop = (id: string, offset: number) => {
    changeStops((current) => {
      const index = current.findIndex((stop) => stop.id === id);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  };

  return (
    <Screen>
      <ScreenTitle>{originalRoute ? 'Edit bus route' : 'Build your bus route'}</ScreenTitle>
      <Subtle>Enter stops in travel order. Saved routes stay on this device and work offline.</Subtle>
      {originalRoute && isBusRouteInUse(app, originalRoute.id) ? <Subtle>Your current trip keeps its stops when you edit this saved route.</Subtle> : null}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.muted }]}>ROUTE NAME</Text>
        <TextInput accessibilityLabel="Route name" editable={!busy} value={routeName} onChangeText={(value) => { if (!operation.current) { setRouteName(value); setProblem(null); } }} placeholder="For example, EDSA Carousel" placeholderTextColor={colors.quiet} style={[styles.input, { borderBottomColor: colors.line, color: colors.ink }]} returnKeyType="done" />
      </View>
      <View style={styles.stopHeading}>
        <SectionTitle>Stops in order</SectionTitle>
        <DataSeal label={`${stops.length} stops`} tone="neutral" />
      </View>
      <Subtle>Record a point only while physically at that stop. If you do not have a location for every stop, Navo keeps manual progress available.</Subtle>

      {stops.map((stop, index) => (
        <View key={stop.id} style={[styles.stopEditor, { borderBottomColor: colors.line }]}>
          <View style={styles.stopNameRow}>
            <Text style={[styles.order, { color: colors.accent }]}>{String(index + 1).padStart(2, '0')}</Text>
            <TextInput accessibilityLabel={`Stop ${index + 1} name`} editable={!busy} value={stop.name} onChangeText={(name) => changeStops((current) => current.map((item) => item.id === stop.id ? { ...item, name } : item))} placeholder={index === 0 ? 'Boarding stop' : index === stops.length - 1 ? 'Destination' : 'Next stop'} placeholderTextColor={colors.quiet} style={[styles.input, styles.stopInput, { borderBottomColor: colors.line, color: colors.ink }]} returnKeyType="next" />
            {stops.length > 2 && <Pressable motion="compact" accessibilityRole="button" accessibilityLabel={`Remove stop ${stop.name || index + 1}`} disabled={busy} onPress={() => changeStops((current) => current.filter((item) => item.id !== stop.id))} style={styles.removeButton}><Feather name="x" size={17} color={colors.muted} /></Pressable>}
          </View>
          <View style={styles.stopTools}>
            <Pressable motion="compact" accessibilityRole="button" accessibilityLabel={`Move ${stop.name || `stop ${index + 1}`} up`} accessibilityState={{ disabled: busy || index === 0 }} disabled={busy || index === 0} onPress={() => moveStop(stop.id, -1)} style={[styles.moveButton, { opacity: busy || index === 0 ? 0.4 : 1 }]}><Feather name="arrow-up" size={18} color={colors.accent} /></Pressable>
            <Pressable motion="compact" accessibilityRole="button" accessibilityLabel={`Move ${stop.name || `stop ${index + 1}`} down`} accessibilityState={{ disabled: busy || index === stops.length - 1 }} disabled={busy || index === stops.length - 1} onPress={() => moveStop(stop.id, 1)} style={[styles.moveButton, { opacity: busy || index === stops.length - 1 ? 0.4 : 1 }]}><Feather name="arrow-down" size={18} color={colors.accent} /></Pressable>
            <Text style={[styles.locationText, { color: colors.muted }]}>Move stop</Text>
          </View>
          <View style={styles.locationTools}>
            <Pressable motion="card" accessibilityRole="button" accessibilityLabel={`Save current location for ${stop.name || `stop ${index + 1}`}`} onPress={() => void recordLocation(stop)} disabled={busy} style={styles.locationRow}>
              <Feather name={stop.latitude === undefined ? 'map-pin' : 'check-circle'} size={15} color={stop.latitude === undefined ? colors.accent : colors.teal} />
              <Text style={[styles.locationText, styles.locationCopy, { color: stop.latitude === undefined ? colors.accent : colors.teal }]}>{busyStop === stop.id ? 'Getting current location…' : stop.latitude === undefined ? 'Save current location' : `Location saved · ${stop.latitude.toFixed(4)}, ${stop.longitude?.toFixed(4)}`}</Text>
            </Pressable>
            {stop.latitude !== undefined || stop.longitude !== undefined ? <Pressable motion="compact" accessibilityRole="button" accessibilityLabel={`Clear saved location for ${stop.name || `stop ${index + 1}`}`} disabled={busy} onPress={() => changeStops((current) => current.map((item) => item.id === stop.id ? { id: item.id, name: item.name } : item))} style={styles.clearLocation}><Text style={[styles.locationText, { color: colors.accent }]}>Clear</Text></Pressable> : null}
          </View>
        </View>
      ))}

      <Pressable motion="card" accessibilityRole="button" disabled={busy} onPress={() => changeStops((current) => [...current.slice(0, -1), newDraft(), current[current.length - 1]!])} style={[styles.addStop, { borderColor: colors.line }]}>
        <Feather name="plus" size={17} color={colors.accent} />
        <Text style={[styles.addStopText, { color: colors.ink }]}>Add a stop before destination</Text>
      </Pressable>
      <Pressable motion="card" accessibilityRole="button" disabled={busy} onPress={() => changeStops((current) => [...current].reverse())} style={[styles.addStop, { borderColor: colors.line }]}>
        <Feather name="repeat" size={17} color={colors.accent} />
        <Text style={[styles.addStopText, { color: colors.ink }]}>Reverse stop order</Text>
      </Pressable>

      <View style={styles.note}>
        <Body>Location checks need a point for every stop.</Body>
        <Subtle>Navo stores these points locally. Coordinate checks follow straight lines between saved stops, so bus bends can create false direction or deviation advice.</Subtle>
      </View>
      {problem ? <Text accessibilityRole="alert" style={[styles.problem, { color: colors.danger }]}>{problem}</Text> : null}
      <PrimaryButton title={saving ? 'Saving route…' : originalRoute ? 'Save route' : 'Save route and choose destination'} onPress={() => void saveRoute()} disabled={!app.ready || busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7 },
  input: { minHeight: 48, paddingHorizontal: 2, borderBottomWidth: 1, fontSize: 16 },
  stopHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stopEditor: { gap: 7, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  stopNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  order: { width: 28, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stopInput: { flex: 1 },
  removeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stopTools: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 38 },
  moveButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  locationTools: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 38 },
  locationRow: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationText: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  locationCopy: { flex: 1 },
  clearLocation: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  addStop: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderWidth: 1, borderRadius: 12 },
  addStopText: { fontSize: 14, fontWeight: '600' },
  note: { gap: 7, paddingTop: 5 },
  problem: { fontSize: 14, lineHeight: 20 },
});
