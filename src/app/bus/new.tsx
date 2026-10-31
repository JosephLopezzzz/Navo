import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { NavoPressable as Pressable } from '../../components/NavoPressable';
import Feather from '@expo/vector-icons/Feather';
import { Body, DataSeal, PrimaryButton, Screen, ScreenTitle, SectionTitle, Subtle } from '../../components/ui';
import type { Stop, TransitRoute } from '../../domain/models';
import { recordCurrentStop } from '../../services/background-location';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

interface StopDraft { id: string; name: string; latitude?: number; longitude?: number }
const newDraft = (name = ''): StopDraft => ({ id: `bus-stop-${Date.now()}-${Math.random().toString(16).slice(2)}`, name });

export default function BusRouteScreen() {
  const colors = useNavoColors();
  const { customBusRoutes, updateState, ready } = useAppState();
  const [routeName, setRouteName] = useState('My bus route');
  const [stops, setStops] = useState<StopDraft[]>([newDraft(''), newDraft('')]);
  const [busyStop, setBusyStop] = useState<string | null>(null);

  const updateStop = (id: string, patch: Partial<StopDraft>) => setStops((current) => current.map((stop) => stop.id === id ? { ...stop, ...patch } : stop));
  const recordLocation = async (stop: StopDraft) => {
    setBusyStop(stop.id);
    try {
      const point = await recordCurrentStop();
      updateStop(stop.id, point);
    } catch (error) {
      Alert.alert('Could not save this location', error instanceof Error ? error.message : 'Try again while you are at the stop.');
    } finally {
      setBusyStop(null);
    }
  };

  const saveRoute = () => {
    const validStops = stops.map((stop) => ({ ...stop, name: stop.name.trim() })).filter((stop) => stop.name.length > 0);
    if (routeName.trim().length < 2 || validStops.length < 2) {
      Alert.alert('Add a route name and two stops', 'Enter the stops in travel order, including the boarding point and destination.');
      return;
    }
    const routeStops: Stop[] = validStops.map((stop, index) => ({ id: stop.id, name: stop.name, latitude: stop.latitude, longitude: stop.longitude }));
    const coordinateStatus = routeStops.every((stop) => stop.latitude !== undefined && stop.longitude !== undefined) ? 'complete' : 'missing';
    const route: TransitRoute = {
      id: `bus-${Date.now()}`,
      name: routeName.trim(),
      mode: 'bus',
      direction: `${routeStops[0]?.name} to ${routeStops[routeStops.length - 1]?.name}`,
      dataQuality: 'user-authored',
      coordinateStatus,
      sourceLabel: 'Stop order and any saved coordinates were entered by you; Navo has not checked this route against operator data.',
      stops: routeStops,
    };
    updateState({ customBusRoutes: [...customBusRoutes, route] });
    router.replace(`/trip/setup?routeId=${route.id}`);
  };

  return (
    <Screen>
      <ScreenTitle>Build your bus route</ScreenTitle>
      <Subtle>Enter stops in travel order. Saved routes stay on this device and work offline.</Subtle>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.muted }]}>ROUTE NAME</Text>
        <TextInput accessibilityLabel="Route name" value={routeName} onChangeText={setRouteName} placeholder="For example, EDSA Carousel" placeholderTextColor={colors.quiet} style={[styles.input, { borderBottomColor: colors.line, color: colors.ink }]} returnKeyType="done" />
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
            <TextInput accessibilityLabel={`Stop ${index + 1} name`} value={stop.name} onChangeText={(name) => updateStop(stop.id, { name })} placeholder={index === 0 ? 'Boarding stop' : index === stops.length - 1 ? 'Destination' : 'Next stop'} placeholderTextColor={colors.quiet} style={[styles.input, styles.stopInput, { borderBottomColor: colors.line, color: colors.ink }]} returnKeyType="next" />
            {stops.length > 2 && <Pressable accessibilityRole="button" accessibilityLabel={`Remove stop ${stop.name || index + 1}`} onPress={() => setStops((current) => current.filter((item) => item.id !== stop.id))} hitSlop={8} style={styles.removeButton}><Feather name="x" size={17} color={colors.muted} /></Pressable>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Save current location for ${stop.name || `stop ${index + 1}`}`} onPress={() => void recordLocation(stop)} disabled={busyStop !== null} style={styles.locationRow}>
            <Feather name={stop.latitude === undefined ? 'map-pin' : 'check-circle'} size={15} color={stop.latitude === undefined ? colors.accent : colors.teal} />
            <Text style={[styles.locationText, { color: stop.latitude === undefined ? colors.accent : colors.teal }]}>{busyStop === stop.id ? 'Getting current location…' : stop.latitude === undefined ? 'Save current location' : `Location saved · ${stop.latitude.toFixed(4)}, ${stop.longitude?.toFixed(4)}`}</Text>
          </Pressable>
        </View>
      ))}

      <Pressable accessibilityRole="button" onPress={() => setStops((current) => [...current.slice(0, -1), newDraft(), current[current.length - 1]!])} style={[styles.addStop, { borderColor: colors.line }]}>
        <Feather name="plus" size={17} color={colors.accent} />
        <Text style={[styles.addStopText, { color: colors.ink }]}>Add a stop before destination</Text>
      </Pressable>

      <View style={styles.note}>
        <Body>Location checks need a point for every stop.</Body>
        <Subtle>Navo stores these points locally. Coordinate checks follow straight lines between saved stops, so bus bends can create false direction or deviation advice.</Subtle>
      </View>
      <PrimaryButton title="Save route and choose destination" onPress={saveRoute} disabled={!ready} />
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
  removeButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  locationRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 38 },
  locationText: { fontSize: 12, fontWeight: '600' },
  addStop: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderWidth: 1, borderRadius: 12 },
  addStopText: { fontSize: 14, fontWeight: '600' },
  note: { gap: 7, paddingTop: 5 },
});
