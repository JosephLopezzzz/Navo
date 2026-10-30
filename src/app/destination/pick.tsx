import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import * as Location from 'expo-location';
import { Divider, PrimaryButton, Screen, ScreenTitle, Subtle } from '../../components/ui';
import { createDestinationAlarm, DEFAULT_DESTINATION_RADIUS_M, disarmDestinationAlarm } from '../../domain/destination-alarm';
import type { DestinationKind, DestinationSource, SavedDestination } from '../../domain/models';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';
import { clearPendingDestinationMapSelection, takePendingDestinationMapSelection } from '../../state/destination-map-selection';
import { createPlacesSearchSessionId, discoverNearbyPlaces, resolvePlaceSuggestion, suggestPlaces, type TomTomPlaceSuggestion } from '../../services/tomtom';
import { railLines } from '../../data/routes';

const WAKE_RADII = [200, 500, 1000];

type Coordinate = { latitude: number; longitude: number };
type PickerStep = 'choose' | 'review';

const destinationKinds: { id: DestinationKind; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: 'rail-station', label: 'Rail', icon: 'navigation' },
  { id: 'bus-dropoff', label: 'Bus', icon: 'truck' },
  { id: 'place', label: 'Place', icon: 'map-pin' },
];

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function destinationKindLabel(kind: DestinationKind): string {
  return kind === 'rail-station' ? 'Rail station' : kind === 'bus-dropoff' ? 'Bus stop or area' : 'Place';
}

export default function DestinationPickerScreen() {
  const app = useAppState();
  const params = useLocalSearchParams<{ destinationId?: string; kind?: string }>();
  const destinationId = typeof params.destinationId === 'string' ? params.destinationId : undefined;
  const initialDestination = destinationId ? app.destinations.find((item) => item.id === destinationId) : undefined;
  const initialKind = destinationKinds.some((item) => item.id === params.kind) ? params.kind as DestinationKind : app.firstRun.preferences.preferredMode;

  if (!app.ready) {
    return <Screen><ScreenTitle>Loading alarms</ScreenTitle><Subtle>Reading saved places from this device.</Subtle></Screen>;
  }
  if (destinationId && !initialDestination) {
    return <Screen><ScreenTitle>Alarm not found</ScreenTitle><Subtle>It may have been removed from this device.</Subtle></Screen>;
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
  const [step, setStep] = useState<PickerStep>(initialDestination ? 'review' : 'choose');
  const [kind, setKind] = useState<DestinationKind>(initialDestination?.kind ?? initialKind);
  const [railLineId, setRailLineId] = useState(app.firstRun.preferences.preferredRailLineId);
  const [nearbySuggestions, setNearbySuggestions] = useState<TomTomPlaceSuggestion[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [allStationsVisible, setAllStationsVisible] = useState(false);
  const [name, setName] = useState(initialDestination?.name ?? '');
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
  const [query, setQuery] = useState(initialDestination?.name ?? '');
  const [shouldSearch, setShouldSearch] = useState(false);
  const [suggestions, setSuggestions] = useState<TomTomPlaceSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [searchProblem, setSearchProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  const searchSessionId = useRef(createPlacesSearchSessionId());
  const screenScrollRef = useRef<ScrollViewInstance>(null);
  const searchController = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const selectedRailLine = railLines.find((line) => line.id === railLineId) ?? railLines[0]!;
  const savedForKind = useMemo(() => {
    return app.destinations
      .filter((destination) => destination.kind === kind)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5);
  }, [app.destinations, kind]);

  useFocusEffect(useCallback(() => {
    const selection = takePendingDestinationMapSelection();
    if (!selection) return;
    setCoordinate({ latitude: selection.latitude, longitude: selection.longitude });
    setName(selection.name);
    setSubtitle(selection.subtitle);
    setSource(selection.source);
    setProviderPlaceId(selection.providerPlaceId);
    setPointConfirmed(true);
    setStep('review');
    setSaveProblem(null);
    setSearchProblem(null);
    setSuggestions([]);
  }, []));

  useEffect(() => {
    const value = query.trim();
    if (step !== 'choose' || !shouldSearch || value.length < 3) return;
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
          setSearchProblem(error instanceof Error ? error.message : 'Search is unavailable. Try picking a point on the map.');
        }
      }).finally(() => {
        if (!controller.signal.aborted) setSearchLoading(false);
      });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, shouldSearch, step]);

  useEffect(() => {
    if (step !== 'choose' || kind === 'rail-station') return;
    let active = true;
    void (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!active) return;
        if (!permission.granted) {
          setNearbyLoading(false);
          return;
        }
        setNearbyLoading(true);
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const results = await discoverNearbyPlaces(kind, {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        }, searchSessionId.current);
        if (active) setNearbySuggestions(results);
      } catch {
        // The search field and explicit nearby action remain available if location lookup fails.
      } finally {
        if (active) setNearbyLoading(false);
      }
    })();
    return () => { active = false; };
  }, [kind, step]);

  const existingAlarm = destinationId
    ? app.destinationAlarms.find((alarm) => alarm.destinationId === destinationId)
    : undefined;
  const editWillDisarm = Boolean(existingAlarm?.enabled);

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
      setPointConfirmed(true);
      setQuery(place.name);
      setShouldSearch(false);
      setSuggestions([]);
      setNearbySuggestions([]);
      setStep('review');
    } catch (error) {
      setSearchProblem(error instanceof Error ? error.message : 'Could not open that place. Try picking a point on the map.');
    } finally {
      busyRef.current = false;
      setResolvingId(null);
    }
  };

  const openMap = () => {
    if (kind === 'rail-station') return;
    clearPendingDestinationMapSelection();
    setSuggestions([]);
    setShouldSearch(false);
    router.push({
      pathname: '/destination/map',
      params: {
        kind,
        ...(coordinate ? { latitude: String(coordinate.latitude), longitude: String(coordinate.longitude) } : {}),
      },
    });
  };

  const findNearby = async () => {
    if (kind === 'rail-station' || nearbyLoading || busyRef.current) return;
    setNearbyLoading(true);
    setSearchProblem(null);
    setSuggestions([]);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setSearchProblem('Location is off. Allow it while using Navo to find nearby suggestions, or browse the saved destinations below.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const results = await discoverNearbyPlaces(kind, {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      }, searchSessionId.current);
      setNearbySuggestions(results);
      if (results.length === 0) setSearchProblem('No nearby matches yet. Try a search or choose a point on the map.');
    } catch (error) {
      setNearbySuggestions([]);
      setSearchProblem(error instanceof Error ? error.message : 'Nearby search is unavailable. Try a search or choose a point on the map.');
    } finally {
      setNearbyLoading(false);
    }
  };

  const browseSavedDestination = (destination: SavedDestination) => {
    router.push({ pathname: '/destination/pick', params: { destinationId: destination.id } });
  };

  const searchRailStation = (stationName: string) => {
    setQuery(`${stationName}, ${selectedRailLine.name}, Philippines`);
    setSuggestions([]);
    setNearbySuggestions([]);
    setShouldSearch(true);
    setSearchProblem(null);
    requestAnimationFrame(() => screenScrollRef.current?.scrollTo({ y: 0, animated: true }));
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
      void router.replace('/(tabs)');
    } catch {
      setSaveProblem('Navo could not save this alarm on your device. Check storage and try again.');
      busyRef.current = false;
      setSaving(false);
    }
  };

  const back = () => {
    if (step === 'review' && !destinationId) {
      setStep('choose');
      setSaveProblem(null);
      return;
    }
    router.back();
  };

  const searchPlaceholder = kind === 'rail-station'
    ? 'Search a station'
    : kind === 'bus-dropoff' ? 'Search a bus stop or area' : 'Search a place';
  const visibleSuggestions = suggestions.length > 0 ? suggestions : nearbySuggestions;
  const showingNearby = suggestions.length === 0 && nearbySuggestions.length > 0;
  const visibleRailStops = selectedRailLine.stops.slice(0, allStationsVisible ? selectedRailLine.stops.length : 6);
  const permissionSummaryText = 'Uses your current location with TomTom to find nearby stops.';
  const footer = step === 'review' ? (
    <>
      {editWillDisarm ? <Text style={[styles.warningText, { color: colors.warning }]}>Saving changes turns this alarm off.</Text> : null}
      {saveProblem ? <Text accessibilityRole="alert" style={[styles.problemText, { color: colors.danger }]}>{saveProblem}</Text> : null}
      <PrimaryButton title={saving ? 'Saving…' : 'Save alarm'} onPress={() => void saveDestination()} disabled={!coordinate || !pointConfirmed || !name.trim() || saving} />
      <Text style={[styles.footnote, { color: colors.muted }]}>Alarm stays off until you switch it on.</Text>
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => router.back()} style={styles.cancelButton}>
        <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
      </Pressable>
    </>
  ) : undefined;

  return (
    <Screen scrollRef={screenScrollRef} footer={footer}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={step === 'review' && !destinationId ? 'Back to stop search' : 'Go back'} onPress={back} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={colors.ink} />
        </Pressable>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={[styles.headerTitle, { color: colors.ink }]}>{destinationId ? 'Edit alarm' : 'Add alarm'}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>{step === 'choose' ? 'Choose your destination.' : 'Review your stop.'}</Text>
        </View>
      </View>

      {step === 'choose' ? (
        <>
          <View style={styles.chooserIntro}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>CHOOSE YOUR DESTINATION</Text>
            <Text accessibilityRole="header" style={[styles.chooserTitle, { color: colors.ink }]}>Where are you going?</Text>
            <Subtle>Save a stop now. Turn the alarm on when you’re ready to travel.</Subtle>
          </View>
          <View style={styles.kindSection}>
            <View style={[styles.kindControl, { backgroundColor: colors.raised }]}>
              {destinationKinds.map((item) => {
                const selected = item.id === kind;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={destinationKindLabel(item.id)}
                    onPress={() => {
                      if (item.id === kind) return;
                      setKind(item.id);
                      setQuery('');
                      setSuggestions([]);
                      setNearbySuggestions([]);
                      setSearchProblem(null);
                      setShouldSearch(false);
                    }}
                    style={[styles.kindOption, selected && { backgroundColor: colors.surface }]}
                  >
                    <Feather name={item.icon} size={16} color={selected ? colors.accent : colors.muted} />
                    <Text style={[styles.kindText, { color: selected ? colors.ink : colors.muted }]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {kind === 'rail-station' ? (
            <View style={styles.railBrowse}>
              <View style={styles.railHeading}>
                <Text accessibilityRole="header" style={[styles.railTitle, { color: colors.ink }]}>Choose a line</Text>
                <Text style={[styles.railCount, { color: colors.muted }]}>{selectedRailLine.stops.length} stations</Text>
              </View>
              <View style={styles.lineOptions}>
                {railLines.map((line) => {
                  const selected = line.id === selectedRailLine.id;
                  return (
                    <Pressable
                      key={line.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => { setRailLineId(line.id); setQuery(''); setSuggestions([]); setSearchProblem(null); setShouldSearch(false); setAllStationsVisible(false); }}
                      style={[styles.lineChip, { borderColor: selected ? colors.accent : colors.line, backgroundColor: selected ? colors.accentSoft : colors.surface }]}
                    >
                      <Text style={[styles.lineChipText, { color: selected ? colors.accent : colors.ink }]}>{line.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.railDirection, { color: colors.muted }]}>{selectedRailLine.direction} · route order</Text>
            </View>
          ) : null}

          <View style={[styles.searchInputWrap, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Feather name="search" size={18} color={colors.muted} />
            <TextInput
              accessibilityLabel={searchPlaceholder}
              autoCapitalize="words"
              autoCorrect={false}
              onChangeText={(value) => {
                setQuery(value);
                setSuggestions([]);
                setNearbySuggestions([]);
                setSearchProblem(null);
                setShouldSearch(true);
              }}
              onFocus={() => setShouldSearch(query.trim().length >= 3)}
              onSubmitEditing={() => setShouldSearch(true)}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.quiet}
              returnKeyType="search"
              value={query}
              style={[styles.searchInput, { color: colors.ink }]}
            />
            {searchLoading || resolvingId ? <ActivityIndicator color={colors.accent} /> : null}
            {query.length > 0 && !searchLoading && !resolvingId && (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => { setQuery(''); setSuggestions([]); setNearbySuggestions([]); setShouldSearch(false); }} style={styles.clearButton}>
                <Feather name="x-circle" size={18} color={colors.quiet} />
              </Pressable>
            )}
          </View>

          {kind !== 'rail-station' ? (
            <>
              <Pressable accessibilityRole="button" onPress={() => void findNearby()} disabled={nearbyLoading} style={[styles.mapAction, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
                <View style={[styles.mapActionIcon, { backgroundColor: colors.surface }]}>
                  {nearbyLoading ? <ActivityIndicator color={colors.accent} /> : <Feather name="crosshair" size={17} color={colors.accent} />}
                </View>
                <View style={styles.actionCopy}>
                  <Text style={[styles.mapActionText, { color: colors.ink }]}>{nearbyLoading ? 'Finding nearby…' : kind === 'bus-dropoff' ? 'Find nearby bus locations' : 'Find places nearby'}</Text>
                  <Text style={[styles.actionDetail, { color: colors.muted }]}>{permissionSummaryText}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={openMap} style={[styles.mapAction, { borderColor: colors.line }]}>
                <View style={[styles.mapActionIcon, { backgroundColor: colors.accentSoft }]}><Feather name="map-pin" size={17} color={colors.accent} /></View>
                <Text style={[styles.mapActionText, { color: colors.ink }]}>{kind === 'bus-dropoff' ? 'Pin a bus drop-off' : 'Choose a point on the map'}</Text>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            </>
          ) : null}

          {query.trim().length > 0 && query.trim().length < 3 && shouldSearch && <Subtle>Enter at least 3 characters to search.</Subtle>}
          {showingNearby ? <Text style={[styles.sectionLabel, { color: colors.muted }]}>{kind === 'bus-dropoff' ? 'Nearby bus locations' : 'Nearby places'}</Text> : null}
          {visibleSuggestions.length > 0 && (
            <View style={[styles.suggestionList, { borderColor: colors.line, backgroundColor: colors.surface }]}>
              {visibleSuggestions.map((suggestion, index) => (
                <View key={suggestion.id}>
                  <Pressable accessibilityRole="button" onPress={() => void handleSuggestion(suggestion)} style={styles.suggestionRow}>
                    <View style={[styles.suggestionIcon, { backgroundColor: colors.accentSoft }]}>
                      <Feather name={suggestion.type === 'poi' ? 'map-pin' : 'map'} size={16} color={colors.accent} />
                    </View>
                    <View style={styles.suggestionCopy}>
                      <Text numberOfLines={2} style={[styles.suggestionTitle, { color: colors.ink }]}>{suggestion.title}</Text>
                      <Text numberOfLines={1} style={[styles.suggestionSubtitle, { color: colors.muted }]}>{[suggestion.subtitles.join(' · ') || 'Place', ...(suggestion.distanceInMeters !== undefined ? [`${suggestion.distanceInMeters < 1000 ? Math.round(suggestion.distanceInMeters) + ' m' : (suggestion.distanceInMeters / 1000).toFixed(1) + ' km'} away`] : [])].join(' · ')}</Text>
                    </View>
                    <Feather name="arrow-up-right" size={16} color={colors.quiet} />
                  </Pressable>
                  {index < visibleSuggestions.length - 1 && <Divider />}
                </View>
              ))}
            </View>
          )}
          {shouldSearch && query.trim().length >= 3 && !searchLoading && !resolvingId && suggestions.length === 0 && !searchProblem ? <Subtle>No matches yet. Try a nearby result or adjust your search.</Subtle> : null}
          {searchProblem && <Text accessibilityRole="alert" style={[styles.problemText, { color: colors.danger }]}>{searchProblem}</Text>}

          {kind === 'rail-station' ? (
            <View style={styles.stationSection}>
              <View style={styles.railHeading}>
                <Text accessibilityRole="header" style={[styles.railTitle, { color: colors.ink }]}>Stations on {selectedRailLine.name}</Text>
                <Text style={[styles.railCount, { color: colors.muted }]}>{selectedRailLine.stops.length}</Text>
              </View>
              <Text style={[styles.stationHint, { color: colors.muted }]}>Choose a station to find its precise map location. Station names work offline; setting an alarm needs a confirmed location.</Text>
              <View style={[styles.stationList, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                {visibleRailStops.map((stop, index) => (
                  <View key={stop.id}>
                    <Pressable accessibilityRole="button" onPress={() => searchRailStation(stop.name)} style={styles.stationRow}>
                      <View style={[styles.stationIndex, { backgroundColor: colors.accentSoft }]}><Text style={[styles.stationIndexText, { color: colors.accent }]}>{selectedRailLine.stops.indexOf(stop) + 1}</Text></View>
                      <Text style={[styles.stationName, { color: colors.ink }]}>{stop.name}</Text>
                      <Feather name="search" size={15} color={colors.quiet} />
                    </Pressable>
                    {index < visibleRailStops.length - 1 ? <Divider /> : null}
                  </View>
                ))}
              </View>
              {selectedRailLine.stops.length > 6 ? (
                <Pressable accessibilityRole="button" onPress={() => setAllStationsVisible((value) => !value)} style={styles.showStations}>
                  <Text style={[styles.showStationsText, { color: colors.accent }]}>{allStationsVisible ? 'Show fewer stations' : `Show all ${selectedRailLine.stops.length} stations`}</Text>
                  <Feather name={allStationsVisible ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accent} />
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.savedSection}>
              <Text accessibilityRole="header" style={[styles.railTitle, { color: colors.ink }]}>{savedForKind.length ? 'Saved on this device' : 'Start with a nearby result or search'}</Text>
              {savedForKind.length ? savedForKind.map((destination) => (
                <Pressable key={destination.id} accessibilityRole="button" onPress={() => browseSavedDestination(destination)} style={[styles.savedRow, { borderBottomColor: colors.line }]}>
                  <Feather name="bookmark" size={16} color={colors.accent} />
                  <View style={styles.suggestionCopy}>
                    <Text numberOfLines={1} style={[styles.suggestionTitle, { color: colors.ink }]}>{destination.name}</Text>
                    <Text numberOfLines={1} style={[styles.suggestionSubtitle, { color: colors.muted }]}>{destination.subtitle || 'Saved destination'} · Edit alarm</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.quiet} />
                </Pressable>
              )) : <Subtle>Nearby picks appear after you choose “Find nearby.” Saved stops will appear here for quick access.</Subtle>}
            </View>
          )}

          {coordinate && (
            <Pressable accessibilityRole="button" onPress={() => setStep('review')} style={styles.keepCurrent}>
              <Feather name="check-circle" size={17} color={colors.accent} />
              <Text style={[styles.keepCurrentText, { color: colors.accent }]}>Keep {name || 'current stop'}</Text>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <Pressable accessibilityRole="button" onPress={() => setStep('choose')} style={[styles.selectedPlace, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={[styles.selectedIcon, { backgroundColor: colors.accentSoft }]}>
              <Feather name={kind === 'rail-station' ? 'navigation' : kind === 'bus-dropoff' ? 'truck' : 'map-pin'} size={17} color={colors.accent} />
            </View>
            <View style={styles.selectedCopy}>
              <Text style={[styles.selectedKind, { color: colors.muted }]}>{destinationKindLabel(kind)}</Text>
              <Text numberOfLines={2} style={[styles.selectedName, { color: colors.ink }]}>{name || 'Pinned location'}</Text>
              <Text numberOfLines={1} style={[styles.selectedSubtitle, { color: colors.muted }]}>{subtitle || 'Pinned location'}</Text>
            </View>
            <Text style={[styles.changeText, { color: colors.accent }]}>Change</Text>
          </Pressable>

          <View style={styles.nameSection}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Destination name</Text>
            <TextInput
              accessibilityLabel="Destination name"
              onChangeText={setName}
              placeholder={source === 'map-pin' ? 'Name this stop' : 'Edit destination name'}
              placeholderTextColor={colors.quiet}
              value={name}
              style={[styles.nameInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.ink }]}
              returnKeyType="done"
            />
          </View>

          <View style={styles.radiusSection}>
            <View style={styles.radiusHeading}>
              <View style={styles.radiusCopy}>
                <Text style={[styles.radiusTitle, { color: colors.ink }]}>Remind me before I arrive</Text>
                <Text style={[styles.actionDetail, { color: colors.muted }]}>Choose how close you want to be.</Text>
              </View>
              <Text style={[styles.radiusValue, { color: colors.accent }]}>{radiusM >= 1000 ? `${radiusM / 1000} km` : `${radiusM} m`}</Text>
            </View>
            <View style={styles.radiusOptions}>
              {WAKE_RADII.map((value) => {
                const selected = value === radiusM;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityLabel={`${value} metres`}
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

        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1, gap: 1 },
  headerTitle: { fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 11, lineHeight: 15 },
  chooserIntro: { gap: 5, paddingTop: 1 },
  eyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.4 },
  chooserTitle: { fontSize: 21, lineHeight: 27, fontWeight: '700', letterSpacing: -0.35 },
  kindSection: { gap: 8 },
  kindControl: { flexDirection: 'row', padding: 4, borderRadius: 14, gap: 4 },
  kindOption: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11 },
  kindText: { fontSize: 13, fontWeight: '600' },
  railBrowse: { gap: 8 },
  railHeading: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  railTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  railCount: { fontSize: 12, fontWeight: '600' },
  lineOptions: { flexDirection: 'row', gap: 7 },
  lineChip: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12 },
  lineChipText: { fontSize: 13, fontWeight: '700' },
  railDirection: { fontSize: 12, lineHeight: 17 },
  searchInputWrap: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, minHeight: 50, fontSize: 15 },
  clearButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  mapAction: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderWidth: 1, borderRadius: 14 },
  mapActionIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  actionCopy: { flex: 1, gap: 2 },
  mapActionText: { fontSize: 14, fontWeight: '600' },
  actionDetail: { fontSize: 11, lineHeight: 15 },
  sectionLabel: { marginTop: 1, fontSize: 13, fontWeight: '700' },
  suggestionList: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  suggestionRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  suggestionIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  suggestionCopy: { flex: 1, gap: 3 },
  suggestionTitle: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  suggestionSubtitle: { fontSize: 12 },
  problemText: { fontSize: 13, lineHeight: 19 },
  stationSection: { gap: 8 },
  stationHint: { fontSize: 12, lineHeight: 18 },
  stationList: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  stationRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 },
  stationIndex: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  stationIndexText: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stationName: { flex: 1, fontSize: 13, fontWeight: '600' },
  showStations: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  showStationsText: { fontSize: 13, fontWeight: '700' },
  savedSection: { gap: 8, paddingTop: 2 },
  savedRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  keepCurrent: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  keepCurrentText: { fontSize: 13, fontWeight: '600' },
  selectedPlace: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderWidth: 1, borderRadius: 14 },
  selectedIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  selectedCopy: { flex: 1, gap: 2 },
  selectedKind: { fontSize: 11, fontWeight: '600' },
  selectedName: { fontSize: 15, lineHeight: 19, fontWeight: '700' },
  selectedSubtitle: { fontSize: 12 },
  changeText: { fontSize: 13, fontWeight: '700', paddingHorizontal: 3 },
  nameSection: { gap: 7 },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  nameInput: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 15 },
  radiusSection: { gap: 10 },
  radiusHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  radiusCopy: { flex: 1, gap: 3 },
  radiusTitle: { fontSize: 15, fontWeight: '700' },
  radiusValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  radiusOptions: { flexDirection: 'row', gap: 7 },
  radiusChip: { flex: 1, minWidth: 54, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1, borderRadius: 11 },
  radiusText: { fontSize: 12, fontWeight: '700' },
  warningText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  footnote: { textAlign: 'center', fontSize: 12 },
  cancelButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 12, fontWeight: '600' },
});
