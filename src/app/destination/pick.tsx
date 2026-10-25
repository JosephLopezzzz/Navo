import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Camera, Map, type CameraRef, type MapRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DataSeal, PrimaryButton, Screen, ScreenTitle, Subtle } from '../../components/ui';
import { createDestinationAlarm, DEFAULT_DESTINATION_RADIUS_M, disarmDestinationAlarm } from '../../domain/destination-alarm';
import type { DestinationKind, DestinationSource, SavedDestination } from '../../domain/models';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';
import { createPlacesSearchSessionId, fetchMapAttribution, resolvePlaceSuggestion, suggestPlaces, TOMTOM_API_KEY, type TomTomPlaceSuggestion } from '../../services/tomtom';

const MANILA_CENTER: [number, number] = [120.9842, 14.5995];
const WAKE_RADII = [250, 500, 750, 1000];

type Coordinate = { latitude: number; longitude: number };
type PickerMode = 'search' | 'pin';
const destinationKinds: { id: DestinationKind; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: 'rail-station', label: 'Rail station', icon: 'navigation' },
  { id: 'bus-dropoff', label: 'Bus drop-off', icon: 'truck' },
  { id: 'place', label: 'Place', icon: 'map-pin' },
];

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

export default function DestinationPickerScreen() {
  const app = useAppState();
  const params = useLocalSearchParams<{ destinationId?: string; kind?: string }>();
  const destinationId = typeof params.destinationId === 'string' ? params.destinationId : undefined;
  const initialDestination = destinationId ? app.destinations.find((item) => item.id === destinationId) : undefined;
  const initialKind = destinationKinds.some((item) => item.id === params.kind) ? params.kind as DestinationKind : 'rail-station';

  if (!app.ready) {
    return <Screen><ScreenTitle>Loading destinations</ScreenTitle><Subtle>Reading saved places from this device.</Subtle></Screen>;
  }
  if (destinationId && !initialDestination) {
    return <Screen><ScreenTitle>Destination not found</ScreenTitle><Subtle>It may have been removed from this device.</Subtle></Screen>;
  }
  return <DestinationForm key={destinationId ?? `new-${initialKind}`} destinationId={destinationId} initialDestination={initialDestination} initialKind={initialKind} />;
}

function DestinationForm({
  destinationId,
  initialDestination,
  initialKind,
}: {
  destinationId?: string;
  initialDestination?: SavedDestination;
  initialKind: DestinationKind;
}) {
  const colors = useNavoColors();
  const app = useAppState();
  const [kind, setKind] = useState<DestinationKind>(initialDestination?.kind ?? initialKind);
  const [name, setName] = useState(initialDestination?.name ?? '');
  const [customName, setCustomName] = useState(Boolean(initialDestination));
  const [subtitle, setSubtitle] = useState(initialDestination?.subtitle ?? '');
  const [coordinate, setCoordinate] = useState<Coordinate | null>(initialDestination
    ? { latitude: initialDestination.latitude, longitude: initialDestination.longitude }
    : null);
  const [pointConfirmed, setPointConfirmed] = useState(Boolean(initialDestination));
  const [source, setSource] = useState<DestinationSource | null>(initialDestination?.source ?? null);
  const [providerPlaceId, setProviderPlaceId] = useState(initialDestination?.providerPlaceId);
  const [radiusM, setRadiusM] = useState(initialDestination
    ? app.destinationAlarms.find((alarm) => alarm.destinationId === initialDestination.id)?.radiusM ?? DEFAULT_DESTINATION_RADIUS_M
    : DEFAULT_DESTINATION_RADIUS_M);
  const [mode, setMode] = useState<PickerMode>('search');
  const [query, setQuery] = useState('');
  const [shouldSearch, setShouldSearch] = useState(false);
  const [suggestions, setSuggestions] = useState<TomTomPlaceSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [searchProblem, setSearchProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const searchSessionId = useRef(createPlacesSearchSessionId());
  const searchController = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!TOMTOM_API_KEY) return;
    let active = true;
    void fetchMapAttribution().then((value) => { if (active) setAttribution(value); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (mode !== 'search' || !shouldSearch || value.length < 3) return;
    const controller = new AbortController();
    searchController.current?.abort();
    searchController.current = controller;
    const timer = setTimeout(() => {
      setSearchLoading(true);
      setSearchProblem(null);
      void suggestPlaces(value, searchSessionId.current, controller.signal).then((results) => {
        if (!controller.signal.aborted) setSuggestions(results);
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setSearchProblem(error instanceof Error ? error.message : 'Search is unavailable. Try placing a pin on the map.');
        }
      }).finally(() => {
        if (!controller.signal.aborted) setSearchLoading(false);
      });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, query, shouldSearch]);

  const mapStyle = useMemo<StyleSpecification | null>(() => {
    if (!TOMTOM_API_KEY) return null;
    const mapStyleName = colors.isDark ? 'street-dark' : 'street-light';
    return {
      version: 8,
      sources: {
        tomtom: {
          type: 'raster',
          tiles: [`https://api.tomtom.com/maps/orbis/display/raster/tile/{z}/{x}/{y}?apiVersion=2&key=${encodeURIComponent(TOMTOM_API_KEY)}&style=${mapStyleName}&tileSize=256&geopoliticalView=PH`],
          tileSize: 256,
          attribution: attribution ?? '© TomTom, © OpenStreetMap',
        },
      },
      layers: [{ id: 'tomtom-raster', type: 'raster', source: 'tomtom' }],
    };
  }, [attribution, colors.isDark]);

  const existingAlarm = destinationId
    ? app.destinationAlarms.find((alarm) => alarm.destinationId === destinationId)
    : undefined;
  const editWillDisarm = Boolean(existingAlarm?.enabled);
  const heading = destinationId ? 'Edit destination' : 'Add a destination';
  const coords = coordinate ? `${formatCoordinate(coordinate.latitude)}, ${formatCoordinate(coordinate.longitude)}` : null;

  const handleSuggestion = async (suggestion: TomTomPlaceSuggestion) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setResolvingId(suggestion.id);
    setSearchProblem(null);
    const controller = new AbortController();
    searchController.current?.abort();
    searchController.current = controller;
    try {
      const place = await resolvePlaceSuggestion(suggestion, searchSessionId.current, kind, controller.signal);
      setCoordinate({ latitude: place.latitude, longitude: place.longitude });
      setSubtitle(place.subtitle ?? '');
      setSource(place.source);
      setProviderPlaceId(place.providerPlaceId);
      setName(place.name);
      setCustomName(false);
      setPointConfirmed(true);
      setMode('search');
      setShouldSearch(false);
      setQuery(place.name);
      cameraRef.current?.easeTo({ center: [place.longitude, place.latitude], zoom: 16, duration: 550 });
      setSuggestions([]);
    } catch (error) {
      setSearchProblem(error instanceof Error ? error.message : 'Could not open that place. Place a pin on the map instead.');
    } finally {
      busyRef.current = false;
      setResolvingId(null);
    }
  };

  const confirmMapCenter = async () => {
    try {
      const center = await mapRef.current?.getCenter();
      if (!center) return;
      const [longitude, latitude] = center;
      setCoordinate({ latitude, longitude });
      setSource('map-pin');
      setProviderPlaceId(undefined);
      setSubtitle('');
      if (!customName) setName('Pinned destination');
      setPointConfirmed(true);
      setMode('pin');
      setSuggestions([]);
      setShouldSearch(false);
    } catch {
      setSaveProblem('The map point could not be read. Wait for the map to load, then try again.');
    }
  };

  const handleMapRegionChange = (event: { nativeEvent: { center: [number, number]; userInteraction: boolean } }) => {
    if (mode !== 'pin' || !event.nativeEvent.userInteraction) return;
    const [longitude, latitude] = event.nativeEvent.center;
    setCoordinate({ latitude, longitude });
    setSource('map-pin');
    setProviderPlaceId(undefined);
    setSubtitle('');
    if (!customName) setName('Pinned destination');
    setPointConfirmed(false);
  };

  const saveDestination = async () => {
    if (!coordinate || !pointConfirmed || busyRef.current) return;
    const label = name.trim();
    if (!label) {
      setSaveProblem('Add a name for this stop before saving it.');
      return;
    }
    busyRef.current = true;
    setSaving(true);
    setSaveProblem(null);
    const now = new Date().toISOString();
    const saved: SavedDestination = {
      id: destinationId ?? newId('destination'),
      name: label,
      ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      kind,
      source: source ?? 'map-pin',
      ...(source === 'tomtom' && providerPlaceId ? { providerPlaceId } : {}),
      createdAt: initialDestination?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await app.mutateState((current) => {
        const destinationAlarms = [...current.destinationAlarms];
        const alarmIndex = destinationAlarms.findIndex((item) => item.destinationId === saved.id);
        if (alarmIndex >= 0) {
          const existing = destinationAlarms[alarmIndex]!;
          destinationAlarms[alarmIndex] = {
            ...disarmDestinationAlarm(existing),
            radiusM,
            watchState: 'off',
          };
        } else {
          destinationAlarms.push(createDestinationAlarm(newId('alarm'), saved.id, radiusM));
        }
        return {
          ...current,
          destinations: current.destinations.some((item) => item.id === saved.id)
            ? current.destinations.map((item) => item.id === saved.id ? saved : item)
            : [...current.destinations, saved],
          destinationAlarms,
        };
      });
      void app.refreshState();
      void router.replace('/(tabs)');
    } catch {
      setSaveProblem('Navo could not save this destination on your device. Check storage and try again.');
      busyRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <ScreenTitle>{heading}</ScreenTitle>
          <Subtle>Choose the stop. Navo will track your phone only while its alarm is on.</Subtle>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close destination picker" onPress={() => router.back()} style={styles.closeButton}>
          <Feather name="x" size={21} color={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.typeSection}>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>DESTINATION TYPE</Text>
        <View style={[styles.kindControl, { borderColor: colors.line, backgroundColor: colors.raised }]}>
          {destinationKinds.map((item) => {
            const selected = item.id === kind;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setKind(item.id)}
                style={[styles.kindOption, selected && { backgroundColor: colors.surface, borderColor: colors.line }]}
              >
                <Feather name={item.icon} size={15} color={selected ? colors.accent : colors.muted} />
                <Text style={[styles.kindText, { color: selected ? colors.ink : colors.muted }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.pickerSection}>
        <View style={styles.modeHeader}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>FIND YOUR STOP</Text>
          <View style={styles.modeSwitch}>
            {(['search', 'pin'] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === item }}
              onPress={() => { setMode(item); setSuggestions([]); setSearchLoading(false); setShouldSearch(false); }}
                style={[styles.modeButton, mode === item && { backgroundColor: colors.accentSoft }]}
              >
                <Text style={[styles.modeText, { color: mode === item ? colors.accent : colors.muted }]}>{item === 'search' ? 'Search' : 'Pin on map'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.searchInputWrap, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput
            accessibilityLabel="Search for a rail station, bus stop, or place"
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={(text) => { setQuery(text); setSuggestions([]); setSearchLoading(false); setShouldSearch(true); setSearchProblem(null); }}
            onFocus={() => { setMode('search'); setSuggestions([]); setShouldSearch(false); }}
            placeholder={kind === 'rail-station' ? 'Search a station in the Philippines' : kind === 'bus-dropoff' ? 'Search a drop-off point' : 'Search a place or address'}
            placeholderTextColor={colors.quiet}
            returnKeyType="search"
            value={query}
            style={[styles.searchInput, { color: colors.ink }]}
          />
          {searchLoading || resolvingId ? <ActivityIndicator color={colors.accent} /> : null}
          {query.length > 0 && !searchLoading && !resolvingId && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => { setQuery(''); setSuggestions([]); setSearchLoading(false); setShouldSearch(false); }} style={styles.clearButton}>
              <Feather name="x-circle" size={18} color={colors.quiet} />
            </Pressable>
          )}
        </View>

        {mode === 'search' && shouldSearch && query.trim().length > 0 && query.trim().length < 3 && (
          <Subtle>Enter at least 3 characters to search.</Subtle>
        )}
        {suggestions.length > 0 && (
          <View style={[styles.suggestionList, { borderColor: colors.line, backgroundColor: colors.surface }]}>
            {suggestions.map((suggestion, index) => (
              <View key={suggestion.id}>
                <Pressable accessibilityRole="button" onPress={() => void handleSuggestion(suggestion)} style={styles.suggestionRow}>
                  <View style={[styles.suggestionIcon, { backgroundColor: colors.accentSoft }]}>
                    <Feather name={suggestion.type === 'poi' ? 'map-pin' : 'map'} size={16} color={colors.accent} />
                  </View>
                  <View style={styles.suggestionCopy}>
                    <Text numberOfLines={1} style={[styles.suggestionTitle, { color: colors.ink }]}>{suggestion.title}</Text>
                    <Text numberOfLines={1} style={[styles.suggestionSubtitle, { color: colors.muted }]}>{suggestion.subtitles.join(' · ') || suggestion.type}</Text>
                  </View>
                  <Feather name="arrow-up-right" size={16} color={colors.quiet} />
                </Pressable>
                {index < suggestions.length - 1 && <View style={[styles.suggestionDivider, { backgroundColor: colors.line }]} />}
              </View>
            ))}
          </View>
        )}
        {searchProblem && <Text accessibilityRole="alert" style={[styles.problemText, { color: colors.danger }]}>{searchProblem}</Text>}
      </View>

      <View style={styles.mapSection}>
        <View style={styles.mapHeader}>
          <View style={styles.mapTitleCopy}>
            <Text style={[styles.mapTitle, { color: colors.ink }]}>Choose on the map</Text>
            <Subtle>{mode === 'pin' ? 'Move the map until the crosshair sits on your stop.' : 'A search result moves the map and sets its point.'}</Subtle>
          </View>
          {coordinate && source === 'tomtom' && <DataSeal label="TomTom place" tone="neutral" />}
          {coordinate && source === 'map-pin' && <DataSeal label="Map pin" tone="neutral" />}
        </View>

        <View style={[styles.mapFrame, { borderColor: colors.line, backgroundColor: colors.raised }]}>
          {mapStyle ? (
            <>
              <Map
                ref={mapRef}
                accessibilityLabel="Destination map"
                attribution
                attributionPosition={{ bottom: 8, right: 8 }}
                compass={false}
                logo
                logoPosition={{ bottom: 8, left: 8 }}
                mapStyle={mapStyle}
                onRegionDidChange={handleMapRegionChange}
                scaleBar={false}
                style={StyleSheet.absoluteFill}
                onDidFailLoadingMap={() => setSaveProblem('The TomTom map could not load. Check your connection and map key.')}
              >
                <Camera
                  ref={cameraRef}
                  initialViewState={{ center: coordinate ? [coordinate.longitude, coordinate.latitude] : MANILA_CENTER, zoom: coordinate ? 16 : 13 }}
                />
              </Map>
              <View pointerEvents="none" style={styles.crosshairWrap}>
                <View style={[styles.crosshairOuter, { borderColor: colors.accent, backgroundColor: colors.surface }]}>
                  <Feather name="crosshair" size={28} color={colors.accent} />
                </View>
              </View>
            </>
          ) : (
            <View style={styles.mapUnavailable}>
              <Feather name="map" size={29} color={colors.accent} />
              <Text style={[styles.mapUnavailableTitle, { color: colors.ink }]}>TomTom map key needed</Text>
              <Text style={[styles.mapUnavailableCopy, { color: colors.muted }]}>Add EXPO_PUBLIC_TOMTOM_API_KEY to a local .env.local file, then rebuild Navo. Place search and map pins use TomTom.</Text>
            </View>
          )}
        </View>

        <View style={styles.mapActions}>
          <View style={styles.coordinateCopy}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>SELECTED POINT</Text>
            <Text style={[styles.coordinateValue, { color: colors.ink }]}>{coords ?? 'Choose a search result or map point'}</Text>
          </View>
          {mode === 'pin' && (
            <Pressable accessibilityRole="button" disabled={!mapStyle} onPress={() => void confirmMapCenter()} style={[styles.usePointButton, { borderColor: colors.line, opacity: mapStyle ? 1 : 0.45 }]}>
              <Feather name="map-pin" size={15} color={colors.accent} />
              <Text style={[styles.usePointText, { color: colors.accent }]}>Use this point</Text>
            </Pressable>
          )}
        </View>
      </View>

      {coordinate && pointConfirmed && (
        <View style={[styles.confirmedPoint, { backgroundColor: colors.accentSoft }]}>
          <Feather name="check-circle" size={17} color={colors.accent} />
          <Text style={[styles.confirmedText, { color: colors.ink }]}>{subtitle || 'Destination point set. You can change its name below.'}</Text>
        </View>
      )}

      <View style={styles.destinationNameSection}>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAME THIS DESTINATION</Text>
        <TextInput
          accessibilityLabel="Destination name"
          onChangeText={(value) => { setName(value); setCustomName(true); }}
          placeholder={source === 'map-pin' ? 'For example, Ayala bus stop' : 'For example, Recto Station'}
          placeholderTextColor={colors.quiet}
          value={name}
          style={[styles.nameInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.ink }]}
        />
        {editWillDisarm && <Subtle>Saving edits will switch this destination alarm off.</Subtle>}
      </View>

      <View style={styles.radiusSection}>
        <View style={styles.radiusCopy}>
          <Text style={[styles.radiusTitle, { color: colors.ink }]}>Wake me when I am near</Text>
          <Subtle>Choose an alert radius around the saved point.</Subtle>
        </View>
        <View style={styles.radiusOptions}>
          {WAKE_RADII.map((value) => {
            const selected = value === radiusM;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setRadiusM(value)}
                style={[styles.radiusChip, { borderColor: selected ? colors.accent : colors.line, backgroundColor: selected ? colors.accentSoft : colors.surface }]}
              >
                <Text style={[styles.radiusText, { color: selected ? colors.accent : colors.ink }]}>{value >= 1000 ? `${value / 1000} km` : `${value} m`}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {saveProblem && <Text accessibilityRole="alert" style={[styles.problemText, { color: colors.danger }]}>{saveProblem}</Text>}
      <View style={styles.saveArea}>
        <PrimaryButton title={saving ? 'Saving destination…' : destinationId ? 'Save changes' : 'Save destination'} onPress={() => void saveDestination()} disabled={!coordinate || !pointConfirmed || !name.trim() || saving} />
          <Text style={[styles.privacyNote, { color: colors.muted }]}>The alarm starts off. GPS checks stay on this device. When you use search or the map, TomTom receives your place query and map requests.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingCopy: { flex: 1, gap: 9, paddingTop: 3 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  typeSection: { gap: 9 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.45 },
  kindControl: { flexDirection: 'row', padding: 4, borderWidth: 1, borderRadius: 14, gap: 4 },
  kindOption: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: 'transparent', borderRadius: 11 },
  kindText: { fontSize: 12, fontWeight: '600' },
  pickerSection: { gap: 10 },
  modeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  modeSwitch: { flexDirection: 'row', gap: 5 },
  modeButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10 },
  modeText: { fontSize: 13, fontWeight: '700' },
  searchInputWrap: { minHeight: 52, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, minHeight: 50, fontSize: 15 },
  clearButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  suggestionList: { borderWidth: 1, borderRadius: 13, overflow: 'hidden' },
  suggestionRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 11 },
  suggestionIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  suggestionCopy: { flex: 1, gap: 3 },
  suggestionTitle: { fontSize: 14, fontWeight: '700' },
  suggestionSubtitle: { fontSize: 12 },
  suggestionDivider: { height: StyleSheet.hairlineWidth, marginLeft: 57 },
  problemText: { fontSize: 13, lineHeight: 19 },
  mapSection: { gap: 11 },
  mapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  mapTitleCopy: { flex: 1, gap: 4 },
  mapTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  mapFrame: { height: 285, borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  crosshairWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  crosshairOuter: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  mapUnavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25, gap: 11 },
  mapUnavailableTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  mapUnavailableCopy: { maxWidth: 300, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  mapActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  coordinateCopy: { flex: 1, gap: 5 },
  coordinateValue: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  usePointButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, borderWidth: 1, borderRadius: 11 },
  usePointText: { fontSize: 13, fontWeight: '700' },
  confirmedPoint: { minHeight: 43, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 9, borderRadius: 11 },
  confirmedText: { flex: 1, fontSize: 13, lineHeight: 18 },
  destinationNameSection: { gap: 9 },
  nameInput: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 15 },
  radiusSection: { gap: 11 },
  radiusCopy: { gap: 4 },
  radiusTitle: { fontSize: 16, fontWeight: '700' },
  radiusOptions: { flexDirection: 'row', gap: 8 },
  radiusChip: { minWidth: 64, flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderRadius: 11 },
  radiusText: { fontSize: 13, fontWeight: '700' },
  saveArea: { gap: 10, paddingBottom: 10 },
  privacyNote: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 7 },
});
