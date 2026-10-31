import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Camera, Map, type CameraRef, type MapRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NavoPressable as Pressable } from '../../components/NavoPressable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { createPlacesSearchSessionId, fetchMapAttribution, resolvePlaceSuggestion, reverseGeocodeCoordinate, suggestPlaces, TOMTOM_API_KEY, type TomTomPlaceSuggestion } from '../../services/tomtom';
import { setPendingDestinationMapSelection, type DestinationMapSelection } from '../../state/destination-map-selection';
import type { DestinationKind } from '../../domain/models';
import { formatCoordinates } from '../../domain/coordinates';
import { useNavoColors } from '../../theme/colors';

const MANILA_CENTER: [number, number] = [120.9842, 14.5995];
const MIN_MAP_ZOOM = 4;
const MAX_MAP_ZOOM = 19;
const MAP_LOAD_TIMEOUT_MS = 15_000;

type Coordinate = { latitude: number; longitude: number };

function validCoordinate(value: string | string[] | undefined, minimum: number, maximum: number): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function kindFromParam(value: string | string[] | undefined): DestinationKind {
  return value === 'rail-station' || value === 'bus-dropoff' || value === 'place' ? value : 'place';
}

async function getCurrentPositionQuickly(): Promise<Location.LocationObject> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), 12_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export default function DestinationMapScreen() {
  const colors = useNavoColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: string; latitude?: string; longitude?: string }>();
  const kind = kindFromParam(params.kind);
  const initialLongitude = validCoordinate(params.longitude, -180, 180) ?? MANILA_CENTER[0];
  const initialLatitude = validCoordinate(params.latitude, -90, 90) ?? MANILA_CENTER[1];
  const initialZoom = params.latitude && params.longitude ? 16 : 13;
  const [center, setCenter] = useState<Coordinate>({ latitude: initialLatitude, longitude: initialLongitude });
  const [zoom, setZoom] = useState(initialZoom);
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
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [searchProblem, setSearchProblem] = useState<string | null>(null);
  const [mapProblem, setMapProblem] = useState<string | null>(null);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [loadedMap, setLoadedMap] = useState<{ style: StyleSpecification; attempt: number } | null>(null);
  const [mapLoadIssue, setMapLoadIssue] = useState<{ style: StyleSpecification; attempt: number; message: string } | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [recentering, setRecentering] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressProblem, setAddressProblem] = useState<string | null>(null);
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const zoomRef = useRef(initialZoom);
  const searchSessionId = useRef(createPlacesSearchSessionId());
  const searchController = useRef<AbortController | null>(null);

  const selectedLatitude = selection.latitude;
  const selectedLongitude = selection.longitude;
  const selectionSource = selection.source;
  const mapInstanceKey = `${mapAttempt}-${colors.isDark ? 'dark' : 'light'}`;
  const loadedMapRef = useRef(loadedMap);

  useEffect(() => {
    if (selectionSource !== 'map-pin' || !TOMTOM_API_KEY) return;

    const controller = new AbortController();
    const coordinate = { latitude: selectedLatitude, longitude: selectedLongitude };
    const timer = setTimeout(() => {
      setAddressLoading(true);
      setAddressProblem(null);
      void reverseGeocodeCoordinate(coordinate, controller.signal).then((address) => {
        if (controller.signal.aborted) return;
        if (!address) {
          setAddressProblem('No nearby address found. The pin coordinates will still be saved.');
          setSelection((current) => current.source === 'map-pin'
            && current.latitude === coordinate.latitude
            && current.longitude === coordinate.longitude
            ? { ...current, name: 'Pinned location', subtitle: `Coordinates · ${formatCoordinates(coordinate)}` }
            : current);
          return;
        }
        setSelection((current) => current.source === 'map-pin'
          && current.latitude === coordinate.latitude
          && current.longitude === coordinate.longitude
          ? { ...current, name: address.name, subtitle: address.subtitle || 'Address matched to pin' }
          : current);
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setAddressProblem(error instanceof Error ? error.message : 'Address lookup failed. The pin coordinates will still be saved.');
          setSelection((current) => current.source === 'map-pin'
            && current.latitude === coordinate.latitude
            && current.longitude === coordinate.longitude
            ? { ...current, name: 'Pinned location', subtitle: `Coordinates · ${formatCoordinates(coordinate)}` }
            : current);
        }
      }).finally(() => {
        if (!controller.signal.aborted) setAddressLoading(false);
      });
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [selectedLatitude, selectedLongitude, selectionSource]);

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
  }, [query, searchEnabled, searchAttempt]);

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

  const zoomBy = async (amount: number) => {
    let currentZoom = zoomRef.current;
    try {
      const mapZoom = await mapRef.current?.getZoom();
      if (typeof mapZoom === 'number' && Number.isFinite(mapZoom)) currentZoom = mapZoom;
    } catch {
      // Keep the last known zoom if the native map is not ready yet.
    }
    const nextZoom = Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, currentZoom + amount));
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    cameraRef.current?.zoomTo(nextZoom, { duration: 180 });
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
          attribution: '© TomTom, © OpenStreetMap',
        },
      },
      layers: [{ id: 'tomtom-raster', type: 'raster', source: 'tomtom' }],
    };
  }, [colors.isDark]);

  const mapReady = loadedMap?.style === mapStyle && loadedMap.attempt === mapAttempt;
  const mapLoadProblem = mapLoadIssue?.style === mapStyle && mapLoadIssue.attempt === mapAttempt ? mapLoadIssue.message : null;

  useEffect(() => {
    if (!mapStyle) return;
    const timeout = setTimeout(() => {
      if (loadedMapRef.current?.style === mapStyle && loadedMapRef.current.attempt === mapAttempt) return;
      setMapLoadIssue({
        style: mapStyle,
        attempt: mapAttempt,
        message: 'The map is taking longer than expected to load. Check your connection and retry.',
      });
    }, MAP_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [mapAttempt, mapStyle]);

  const retryMap = () => {
    setMapAttempt((current) => current + 1);
  };

  const handleSuggestion = async (suggestion: TomTomPlaceSuggestion) => {
    searchController.current?.abort();
    setSearchLoading(false);
    setSuggestions([]);
    setAddressLoading(false);
    setAddressProblem(null);
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
    void mapRef.current?.getZoom().then((nextZoom) => {
      if (!Number.isFinite(nextZoom)) return;
      const boundedZoom = Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, nextZoom));
      zoomRef.current = boundedZoom;
      setZoom(boundedZoom);
    }).catch(() => undefined);
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
      const current = await getCurrentPositionQuickly();
      const next = { latitude: current.coords.latitude, longitude: current.coords.longitude };
      setCenter(next);
      setSelection({ ...next, name: 'Pinned location', subtitle: '', source: 'map-pin' });
      zoomRef.current = 16;
      setZoom(16);
      cameraRef.current?.easeTo({ center: [next.longitude, next.latitude], zoom: 16, duration: 450 });
    } catch (error) {
      setMapProblem(error instanceof Error && error.message === 'LOCATION_TIMEOUT'
        ? 'Location is taking too long. Move the map to choose a point.'
        : 'Current location is unavailable. Move the map to choose a point.');
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
          const sameSelectedPoint = Math.abs(selection.latitude - latitude) < 0.00001
            && Math.abs(selection.longitude - longitude) < 0.00001;
          const hasAddress = sameSelectedPoint && selection.name !== 'Pinned location' && !addressLoading;
          const coordinate = { latitude, longitude };
          nextSelection = {
            ...selection,
            ...coordinate,
            name: hasAddress ? selection.name : 'Pinned location',
            subtitle: hasAddress && selection.subtitle ? selection.subtitle : `Coordinates · ${formatCoordinates(coordinate)}`,
          };
        } else {
          nextSelection = {
            ...selection,
            ...center,
            ...(selection.name === 'Pinned location' ? { subtitle: `Coordinates · ${formatCoordinates(center)}` } : {}),
          };
        }
      } catch {
        nextSelection = {
          ...selection,
          ...center,
          ...(selection.name === 'Pinned location' ? { subtitle: `Coordinates · ${formatCoordinates(center)}` } : {}),
        };
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
            key={mapInstanceKey}
            ref={mapRef}
            accessibilityLabel="Destination map. Move the map to place the pin."
            attribution
            attributionPosition={{ bottom: mapBottomOffset, right: 10 }}
            compass={false}
            doubleTapZoom
            doubleTapHoldZoom
            dragPan
            logo
            logoPosition={{ bottom: mapBottomOffset, left: 10 }}
            mapStyle={mapStyle}
            onRegionDidChange={handleRegionChange}
            onDidFailLoadingMap={() => { setMapLoadIssue({ style: mapStyle, attempt: mapAttempt, message: 'The map could not load. Check your connection or map key, then retry.' }); }}
            onDidFinishLoadingMap={() => {
              const readyMap = { style: mapStyle, attempt: mapAttempt };
              loadedMapRef.current = readyMap;
              setLoadedMap(readyMap);
              setMapLoadIssue((current) => current?.style === mapStyle && current.attempt === mapAttempt ? null : current);
            }}
            scaleBar={false}
            style={StyleSheet.absoluteFill}
            touchPitch={false}
            touchRotate={false}
            touchZoom
          >
            <Camera
              ref={cameraRef}
              initialViewState={{ center: [center.longitude, center.latitude], zoom }}
              minZoom={MIN_MAP_ZOOM}
              maxZoom={MAX_MAP_ZOOM}
            />
          </Map>
          <View pointerEvents="none" style={styles.pinLayer}>
            <View style={styles.pinMarker}>
              <Svg width={48} height={48} viewBox="0 0 24 24" accessibilityLabel="Selected map point">
                <Path
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z"
                  fill={colors.accent}
                  stroke={colors.surface}
                  strokeWidth={0.65}
                />
                <Circle cx={12} cy={9} r={3.3} fill={colors.surface} />
                <Circle cx={12} cy={9} r={1.5} fill={colors.aqua} />
              </Svg>
            </View>
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
          {searchProblem && (
            <View style={[styles.searchProblem, { backgroundColor: colors.surface }]}>
              <Text accessibilityRole="alert" style={[styles.searchProblemText, { color: colors.danger }]}>{searchProblem}</Text>
              <Pressable accessibilityRole="button" onPress={() => { setSearchProblem(null); setSearchAttempt((current) => current + 1); }} style={[styles.searchRetryButton, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.mapRetryText, { color: colors.accent }]}>Try again</Text>
              </Pressable>
            </View>
          )}
          {mapStyle && (
            <View style={styles.mapControls}>
              <Pressable accessibilityRole="button" accessibilityLabel="Recenter on my location" onPress={() => void recenter()} disabled={recentering} style={[styles.mapControlButton, { backgroundColor: colors.surface }]}>
                {recentering ? <ActivityIndicator color={colors.accent} /> : <Feather name="crosshair" size={18} color={colors.accent} />}
              </Pressable>
              <View style={[styles.zoomControls, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" accessibilityState={{ disabled: zoom >= MAX_MAP_ZOOM }} disabled={zoom >= MAX_MAP_ZOOM} onPress={() => void zoomBy(1)} style={styles.mapControlButton}>
                  <Feather name="plus" size={20} color={zoom >= MAX_MAP_ZOOM ? colors.quiet : colors.ink} />
                </Pressable>
                <View style={[styles.zoomDivider, { backgroundColor: colors.line }]} />
                <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" accessibilityState={{ disabled: zoom <= MIN_MAP_ZOOM }} disabled={zoom <= MIN_MAP_ZOOM} onPress={() => void zoomBy(-1)} style={styles.mapControlButton}>
                  <Feather name="minus" size={20} color={zoom <= MIN_MAP_ZOOM ? colors.quiet : colors.ink} />
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {mapStyle && !mapReady && !mapLoadProblem && (
          <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.mapLoading, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.mapLoadingText, { color: colors.muted }]}>Loading map…</Text>
          </View>
        )}

        {attribution && (
          <Text pointerEvents="none" accessibilityLabel={`Map attribution: ${attribution}`} numberOfLines={2} style={[styles.mapAttribution, { backgroundColor: colors.surface, color: colors.muted, bottom: mapBottomOffset + 4 }]}>
            {attribution}
          </Text>
        )}

        <View style={[styles.selectionSheet, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.sheetHeading}>
            <View style={[styles.sheetIcon, { backgroundColor: colors.accentSoft }]}>
              <Feather name="map-pin" size={17} color={colors.accent} />
            </View>
            <View style={styles.sheetCopy}>
              <Text numberOfLines={2} style={[styles.sheetTitle, { color: colors.ink }]}>{selection.name || 'Pinned location'}</Text>
              <Text numberOfLines={1} style={[styles.sheetSubtitle, { color: colors.muted }]}>
                {selection.subtitle || (addressLoading ? 'Finding a nearby place or address…' : selection.source === 'tomtom' ? 'Place selected from search' : 'Move the map to place the pin')}
              </Text>
            </View>
            {addressLoading ? <ActivityIndicator accessibilityLabel="Looking up the pinned address" color={colors.accent} /> : null}
          </View>
          {addressProblem ? <Text style={[styles.mapProblem, { color: colors.muted }]}>{addressProblem}</Text> : null}
          {(mapProblem || !mapStyle) && <Text accessibilityRole="alert" style={[styles.mapProblem, { color: colors.danger }]}>{mapProblem ?? 'Map key needed to choose a point.'}</Text>}
          {mapLoadProblem && (
            <View style={styles.mapRetryRow}>
              <Text accessibilityRole="alert" style={[styles.mapProblem, styles.mapRetryCopy, { color: colors.danger }]}>{mapLoadProblem}</Text>
              <Pressable accessibilityRole="button" onPress={retryMap} style={[styles.mapRetryButton, { backgroundColor: colors.accentSoft }]}>
                <Feather name="rotate-cw" size={15} color={colors.accent} />
                <Text style={[styles.mapRetryText, { color: colors.accent }]}>Retry map</Text>
              </Pressable>
            </View>
          )}
          <Pressable accessibilityRole="button" onPress={() => void confirmSelection()} disabled={!mapStyle || (selection.source === 'map-pin' && !mapReady)} style={({ pressed }) => [styles.confirmButton, { backgroundColor: pressed ? colors.accentHover : colors.accent, opacity: !mapStyle || (selection.source === 'map-pin' && !mapReady) ? 0.45 : 1 }]}>
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
  searchProblem: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 5, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  searchProblemText: { flex: 1, fontSize: 12, lineHeight: 17 },
  searchRetryButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 10 },
  mapLoading: { position: 'absolute', top: 66, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  mapLoadingText: { fontSize: 12, fontWeight: '600' },
  mapAttribution: { position: 'absolute', alignSelf: 'center', left: 72, right: 72, textAlign: 'center', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', fontSize: 9, lineHeight: 12 },
  mapControls: { alignSelf: 'flex-end', alignItems: 'center', gap: 9 },
  zoomControls: { alignItems: 'center', borderWidth: 1, borderRadius: 15, elevation: 4 },
  mapControlButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, elevation: 4 },
  zoomDivider: { width: 28, height: StyleSheet.hairlineWidth },
  selectionSheet: { gap: 10, padding: 12, borderWidth: 1, borderRadius: 18, marginBottom: 4, elevation: 6 },
  sheetHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  sheetCopy: { flex: 1, gap: 3 },
  sheetTitle: { fontSize: 15, fontWeight: '700' },
  sheetSubtitle: { fontSize: 12 },
  mapProblem: { fontSize: 12, lineHeight: 17 },
  mapRetryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapRetryCopy: { flex: 1 },
  mapRetryButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11, paddingHorizontal: 10 },
  mapRetryText: { fontSize: 12, fontWeight: '700' },
  confirmButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 13 },
  confirmText: { fontSize: 14, fontWeight: '700' },
  pinLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pinMarker: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: -20 }], shadowColor: '#07182F', shadowOpacity: 0.24, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  mapUnavailable: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  unavailableTitle: { fontSize: 17, fontWeight: '700' },
  unavailableCopy: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
