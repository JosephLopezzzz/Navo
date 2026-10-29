import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Camera, Map, type CameraRef, type MapRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { createPlacesSearchSessionId, fetchMapAttribution, resolvePlaceSuggestion, suggestPlaces, TOMTOM_API_KEY, type TomTomPlaceSuggestion } from '../../services/tomtom';
import { setPendingDestinationMapSelection, type DestinationMapSelection } from '../../state/destination-map-selection';
import type { DestinationKind } from '../../domain/models';
import { useNavoColors } from '../../theme/colors';

const MANILA_CENTER: [number, number] = [120.9842, 14.5995];

type Coordinate = { latitude: number; longitude: number };

function validCoordinate(value: string | string[] | undefined, minimum: number, maximum: number): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function kindFromParam(value: string | string[] | undefined): DestinationKind {
  return value === 'rail-station' || value === 'bus-dropoff' || value === 'place' ? value : 'place';
}

export default function DestinationMapScreen() {
  const colors = useNavoColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: string; latitude?: string; longitude?: string }>();
  const kind = kindFromParam(params.kind);
  const initialLongitude = validCoordinate(params.longitude, -180, 180) ?? MANILA_CENTER[0];
  const initialLatitude = validCoordinate(params.latitude, -90, 90) ?? MANILA_CENTER[1];
  const [center, setCenter] = useState<Coordinate>({ latitude: initialLatitude, longitude: initialLongitude });
  const [selection, setSelection] = useState<DestinationMapSelection>({
    latitude: initialLatitude,
    longitude: initialLongitude,
    name: 'Pinned location',
    subtitle: '',
    source: 'map-pin',
  });
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<TomTomPlaceSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [searchProblem, setSearchProblem] = useState<string | null>(null);
  const [mapProblem, setMapProblem] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [recentering, setRecentering] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const searchSessionId = useRef(createPlacesSearchSessionId());
  const searchController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!TOMTOM_API_KEY) return;
    let active = true;
    void fetchMapAttribution().then((value) => { if (active) setAttribution(value); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const searchTerm = query.trim();
    if (!searchEnabled || searchTerm.length < 3) return;
    const controller = new AbortController();
    searchController.current?.abort();
    searchController.current = controller;
    const timer = setTimeout(() => {
      setSearchLoading(true);
      setSearchProblem(null);
      void suggestPlaces(searchTerm, searchSessionId.current, controller.signal).then((results) => {
        if (!controller.signal.aborted) setSuggestions(results);
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setSearchProblem(error instanceof Error ? error.message : 'Search is unavailable. Try moving the map.');
        }
      }).finally(() => {
        if (!controller.signal.aborted) setSearchLoading(false);
      });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchEnabled]);

  const updateQuery = (value: string) => {
    setQuery(value);
    setSearchEnabled(true);
    searchController.current?.abort();
    setResolvingId(null);
    setSuggestions([]);
    setSearchLoading(false);
    setSearchProblem(null);
    if (value.trim().length < 3) {
      setSearchEnabled(false);
    }
  };

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

  const handleSuggestion = async (suggestion: TomTomPlaceSuggestion) => {
    searchController.current?.abort();
    setSearchLoading(false);
    setSuggestions([]);
    const controller = new AbortController();
    searchController.current = controller;
    setResolvingId(suggestion.id);
    setSearchProblem(null);
    try {
      const place = await resolvePlaceSuggestion(suggestion, searchSessionId.current, kind, controller.signal);
      if (controller.signal.aborted) return;
      const nextSelection: DestinationMapSelection = {
        latitude: place.latitude,
        longitude: place.longitude,
        name: place.name,
        subtitle: place.subtitle ?? '',
        source: place.source,
        providerPlaceId: place.providerPlaceId,
      };
      setSelection(nextSelection);
      setCenter({ latitude: place.latitude, longitude: place.longitude });
      setQuery(place.name);
      setSearchEnabled(false);
      setSuggestions([]);
      cameraRef.current?.easeTo({ center: [place.longitude, place.latitude], zoom: 16, duration: 450 });
    } catch (error) {
      if (!controller.signal.aborted) {
        setSearchProblem(error instanceof Error ? error.message : 'Could not open that place. Move the map to choose a point.');
      }
    } finally {
      if (!controller.signal.aborted) setResolvingId(null);
    }
  };

  const handleRegionChange = (event: { nativeEvent: { center: [number, number]; userInteraction: boolean } }) => {
    if (!event.nativeEvent.userInteraction) return;
    const [longitude, latitude] = event.nativeEvent.center;
    setCenter({ latitude, longitude });
    setSelection({ latitude, longitude, name: 'Pinned location', subtitle: '', source: 'map-pin' });
    setMapProblem(null);
  };

  const recenter = async () => {
    if (recentering) return;
    setRecentering(true);
    setMapProblem(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setMapProblem('Allow location while using Navo to recenter.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = { latitude: current.coords.latitude, longitude: current.coords.longitude };
      setCenter(next);
      setSelection({ ...next, name: 'Pinned location', subtitle: '', source: 'map-pin' });
      cameraRef.current?.easeTo({ center: [next.longitude, next.latitude], zoom: 16, duration: 450 });
    } catch {
      setMapProblem('Current location is unavailable. Move the map to choose a point.');
    } finally {
      setRecentering(false);
    }
  };

  const confirmSelection = async () => {
    let nextSelection = selection;
    if (selection.source === 'map-pin') {
      try {
        const mapCenter = await mapRef.current?.getCenter();
        if (mapCenter) {
          const [longitude, latitude] = mapCenter;
          nextSelection = { latitude, longitude, name: 'Pinned location', subtitle: '', source: 'map-pin' };
        } else {
          nextSelection = { ...selection, ...center };
        }
      } catch {
        nextSelection = { ...selection, ...center };
      }
    }
    setPendingDestinationMapSelection(nextSelection);
    router.back();
  };

  const mapBottomOffset = Math.max(174, insets.bottom + 162);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {mapStyle ? (
        <>
          <Map
            ref={mapRef}
            accessibilityLabel="Destination map. Move the map to place the pin."
            attribution
            attributionPosition={{ bottom: mapBottomOffset, right: 10 }}
            compass={false}
            logo
            logoPosition={{ bottom: mapBottomOffset, left: 10 }}
            mapStyle={mapStyle}
            onRegionDidChange={handleRegionChange}
                onDidFailLoadingMap={() => { setMapReady(false); setMapProblem('The map could not load. Check your connection or map key.'); }}
                onDidFinishLoadingMap={() => { setMapReady(true); setMapProblem(null); }}
            scaleBar={false}
            style={StyleSheet.absoluteFill}
          >
            <Camera
              ref={cameraRef}
              initialViewState={{ center: [initialLongitude, initialLatitude], zoom: params.latitude ? 16 : 13 }}
            />
          </Map>
          <View pointerEvents="none" style={styles.pinLayer}>
            <View style={[styles.pinShadow, { backgroundColor: colors.midnight }]} />
            <Feather name="map-pin" size={30} color={colors.aqua} />
            <View style={[styles.pinDot, { backgroundColor: colors.midnight }]} />
          </View>
        </>
      ) : (
        <View style={styles.mapUnavailable}>
          <Feather name="map" size={26} color={colors.accent} />
          <Text style={[styles.unavailableTitle, { color: colors.ink }]}>Map unavailable</Text>
          <Text style={[styles.unavailableCopy, { color: colors.muted }]}>Add a TomTom key to search places and choose a map point.</Text>
        </View>
      )}

      <SafeAreaView pointerEvents="box-none" style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topArea}>
          <View style={styles.searchRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to destination" onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface }]}>
              <Feather name="arrow-left" size={20} color={colors.ink} />
            </Pressable>
            <View style={[styles.searchField, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Feather name="search" size={17} color={colors.muted} />
              <TextInput
                accessibilityLabel="Search places on map"
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={updateQuery}
                placeholder={kind === 'rail-station' ? 'Search a station' : kind === 'bus-dropoff' ? 'Search a bus stop or area' : 'Search a place'}
                placeholderTextColor={colors.quiet}
                returnKeyType="search"
                value={query}
                style={[styles.searchInput, { color: colors.ink }]}
              />
              {searchLoading || resolvingId ? <ActivityIndicator color={colors.accent} /> : null}
              {query.length > 0 && !searchLoading && !resolvingId && (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear place search" onPress={() => updateQuery('')} style={styles.clearButton}>
                  <Feather name="x-circle" size={17} color={colors.quiet} />
                </Pressable>
              )}
            </View>
          </View>
          {suggestions.length > 0 && (
            <View style={[styles.suggestionList, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.suggestionScroll}>
                {suggestions.map((suggestion) => (
                  <Pressable key={suggestion.id} accessibilityRole="button" onPress={() => void handleSuggestion(suggestion)} style={[styles.suggestionRow, { borderBottomColor: colors.line }]}>
                    <Feather name={suggestion.type === 'poi' ? 'map-pin' : 'map'} size={17} color={colors.accent} />
                    <View style={styles.suggestionCopy}>
                      <Text numberOfLines={1} style={[styles.suggestionTitle, { color: colors.ink }]}>{suggestion.title}</Text>
                      <Text numberOfLines={1} style={[styles.suggestionSubtitle, { color: colors.muted }]}>{suggestion.subtitles.join(' · ') || 'Place'}</Text>
                    </View>
                    <Feather name="arrow-up-right" size={15} color={colors.quiet} />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          {searchProblem && <Text accessibilityRole="alert" style={[styles.searchProblem, { color: colors.danger, backgroundColor: colors.surface }]}>{searchProblem}</Text>}
          {mapStyle && (
            <Pressable accessibilityRole="button" accessibilityLabel="Recenter on my location" onPress={() => void recenter()} disabled={recentering} style={[styles.recenterButton, { backgroundColor: colors.surface }]}>
              {recentering ? <ActivityIndicator color={colors.accent} /> : <Feather name="crosshair" size={18} color={colors.accent} />}
            </Pressable>
          )}
        </View>

        <View style={[styles.selectionSheet, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.sheetHeading}>
            <View style={[styles.sheetIcon, { backgroundColor: colors.accentSoft }]}>
              <Feather name={selection.source === 'tomtom' ? 'map-pin' : 'crosshair'} size={17} color={colors.accent} />
            </View>
            <View style={styles.sheetCopy}>
              <Text style={[styles.sheetTitle, { color: colors.ink }]}>{selection.name || 'Pinned location'}</Text>
              <Text numberOfLines={1} style={[styles.sheetSubtitle, { color: colors.muted }]}>
                {selection.subtitle || (selection.source === 'tomtom' ? 'Place selected from search' : 'Move the map to place the pin')}
              </Text>
            </View>
          </View>
          {(mapProblem || !mapStyle) && <Text accessibilityRole="alert" style={[styles.mapProblem, { color: colors.danger }]}>{mapProblem ?? 'Map key needed to choose a point.'}</Text>}
          <Pressable accessibilityRole="button" onPress={() => void confirmSelection()} disabled={!mapStyle || (selection.source === 'map-pin' && !mapReady)} style={({ pressed }) => [styles.confirmButton, { backgroundColor: colors.accent, opacity: !mapStyle || (selection.source === 'map-pin' && !mapReady) ? 0.45 : pressed ? 0.82 : 1 }]}>
            <Text style={[styles.confirmText, { color: colors.onAccent }]}>{selection.source === 'tomtom' ? 'Use this place' : 'Use this location'}</Text>
            <Feather name="arrow-right" size={17} color={colors.onAccent} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'space-between', paddingHorizontal: 14 },
  topArea: { gap: 8, paddingTop: 6 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, elevation: 4 },
  searchField: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderWidth: 1, borderRadius: 15, elevation: 4 },
  searchInput: { flex: 1, minHeight: 48, fontSize: 14 },
  clearButton: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  suggestionList: { maxHeight: 220, borderWidth: 1, borderRadius: 14, overflow: 'hidden', elevation: 5 },
  suggestionScroll: { flexGrow: 0 },
  suggestionRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestionCopy: { flex: 1, gap: 3 },
  suggestionTitle: { fontSize: 14, fontWeight: '600' },
  suggestionSubtitle: { fontSize: 12 },
  searchProblem: { alignSelf: 'stretch', paddingHorizontal: 12, paddingVertical: 9, fontSize: 12, lineHeight: 17, borderRadius: 12, overflow: 'hidden' },
  recenterButton: { alignSelf: 'flex-end', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, elevation: 4 },
  selectionSheet: { gap: 10, padding: 12, borderWidth: 1, borderRadius: 18, marginBottom: 4, elevation: 6 },
  sheetHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  sheetCopy: { flex: 1, gap: 3 },
  sheetTitle: { fontSize: 15, fontWeight: '700' },
  sheetSubtitle: { fontSize: 12 },
  mapProblem: { fontSize: 12, lineHeight: 17 },
  confirmButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 13 },
  confirmText: { fontSize: 14, fontWeight: '700' },
  pinLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pinShadow: { position: 'absolute', width: 28, height: 5, opacity: 0.15, borderRadius: 8, transform: [{ translateY: 18 }] },
  pinDot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, transform: [{ translateY: -1 }] },
  mapUnavailable: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  unavailableTitle: { fontSize: 17, fontWeight: '700' },
  unavailableCopy: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
