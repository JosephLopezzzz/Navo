import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Camera, GeoJSONSource, Layer, Map, type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import { ActivityIndicator, Animated, Easing, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRailStation, railStations, searchRailStations, type RailStation } from '../data/rail-stations';
import { railLines } from '../data/routes';
import { createRailLineFeature, createRailStationFeatures, getRailLineBounds, resolveRailMapStationTap, resolveRailStationScreenHit } from '../domain/rail-map';
import { createDestinationMapStyle } from '../services/destination-map-style';
import { fetchMapAttribution } from '../services/tomtom';
import { spacing, useNavoColors } from '../theme/colors';
import { useMotionPreferences } from './MotionPreferencesProvider';
import { NavoPressable } from './NavoPressable';
import { getRailDiagramStations } from './rail-diagram-layout';
import { getRailDiagramPalette, railDiagramMetrics, type RailDiagramPalette } from './rail-diagram-tokens';

interface RailStationMapPickerProps {
  lineId: string;
  selectedStationId?: string;
  onLineChange: (lineId: string) => void;
  onSelect: (stationId: string) => void;
  onConfirm: (stationId: string) => void;
  onClose: () => void;
  onOtherDestinations: () => void;
  title?: string;
  storageProblem?: string | null;
  onRetryStorage?: () => void;
}

const MAP_TIMEOUT_MS = 15_000;
const LABEL_ZOOM = 15;
type ProjectedStation = { stationId: string; x: number; y: number };
type StationPreview = { scope: string; stationId: string | null; kind: 'hover' | 'hold' | null };

/** Catalog-only rail workspace. Camera changes never create or move a selection. */
export function RailStationMapPicker({ lineId, selectedStationId, onLineChange, onSelect, onConfirm, onClose, onOtherDestinations, title = 'Add rail alarm', storageProblem, onRetryStorage }: RailStationMapPickerProps) {
  const colors = useNavoColors();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { reduceMotion, isActive, pathname } = useMotionPreferences();
  const [query, setQuery] = useState('');
  const [browseOpen, setBrowseOpen] = useState(false);
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);
  const [zoom, setZoom] = useState(12);
  const [mapMoving, setMapMoving] = useState(false);
  const [viewportRevision, setViewportRevision] = useState(0);
  const [projectedLabels, setProjectedLabels] = useState<{ scope: string; points: ProjectedStation[] }>({ scope: '', points: [] });
  const [preview, setPreview] = useState<StationPreview>({ scope: '', stationId: null, kind: null });
  const [attempt, setAttempt] = useState(0);
  const [loadedScope, setLoadedScope] = useState<string>();
  const [styleScope, setStyleScope] = useState<string>();
  const [loadIssue, setLoadIssue] = useState<{ scope: string; message: string }>();
  const [attribution, setAttribution] = useState<string | null>(null);
  const [mapSize, setMapSize] = useState({ width: window.width, height: window.height });
  const [viewportHeight, setViewportHeight] = useState(window.height);
  const [topHeight, setTopHeight] = useState(204);
  const [bottomHeight, setBottomHeight] = useState(178);
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const projectionRevision = useRef(0);
  const suppressSourceTap = useRef(false);
  const holdOrigin = useRef<{ x: number; y: number } | null>(null);
  const cameraIntent = useRef<'line' | 'station'>(selectedStationId ? 'station' : 'line');
  const fittedScope = useRef<string | undefined>(undefined);
  const currentLine = railLines.find((line) => line.id === lineId) ?? railLines[0]!;
  const stations = useMemo(() => getRailDiagramStations(currentLine.id, railStations), [currentLine.id]);
  const bounds = useMemo(() => getRailLineBounds(stations), [stations]);
  const connection = useMemo(() => createRailLineFeature(stations), [stations]);
  const stationFeatures = useMemo(() => createRailStationFeatures(stations), [stations]);
  const selectedCandidate = getRailStation(selectedStationId);
  const selected = selectedCandidate?.lineId === currentLine.id ? selectedCandidate : undefined;
  const palette = getRailDiagramPalette(currentLine.id, colors.isDark);
  const mapStyle = useMemo(() => createDestinationMapStyle(colors.isDark), [colors.isDark]);
  const mapScope = `${attempt}:${colors.isDark}`;
  const loadedScopeRef = useRef(loadedScope);
  const imageryReady = Boolean(mapStyle && loadedScope === mapScope);
  const problem = !mapStyle ? 'Map imagery is unavailable. Search or browse the saved station catalog below.'
    : loadIssue?.scope === mapScope ? loadIssue.message : undefined;
  const filteredIds = useMemo(() => new Set(searchRailStations(currentLine.id, query).map((station) => station.id)), [currentLine.id, query]);
  const results = stations.filter((station) => filteredIds.has(station.id));
  const showStations = browseOpen || Boolean(query.trim()) || (Boolean(problem) && !catalogCollapsed);
  const overlayHeight = Math.max(2, viewportHeight - insets.top - insets.bottom - spacing.xs * 2 - spacing.sm * 2);
  const mapGap = Math.min(80, Math.max(0, overlayHeight - 96));
  const panelBudget = Math.max(2, overlayHeight - mapGap);
  const topLimit = panelBudget * (showStations ? 0.44 : 0.50);
  const bottomLimit = panelBudget - topLimit;
  const floatingControlFits = overlayHeight - topHeight - bottomHeight >= 48;
  const mapHeight = Math.max(1, mapSize.height);
  const keyboardOcclusion = Math.max(0, mapHeight - viewportHeight);
  const padding = useMemo(() => {
    const requestedTop = insets.top + topHeight + spacing.lg;
    const requestedBottom = keyboardOcclusion + insets.bottom + bottomHeight + spacing.xl;
    // Preserve an actual viewport even with a keyboard, small screen, or large text.
    const available = Math.max(0, mapHeight - 80);
    const ratio = Math.min(1, available / (requestedTop + requestedBottom));
    const horizontal = Math.min(spacing.xl, Math.max(0, (mapSize.width - 80) / 2));
    return { top: requestedTop * ratio, right: horizontal, bottom: requestedBottom * ratio, left: horizontal };
  }, [insets.top, insets.bottom, topHeight, bottomHeight, mapHeight, mapSize.width, keyboardOcclusion]);
  const ornamentBottom = Math.max(0, Math.min(mapHeight - 32, keyboardOcclusion + insets.bottom + bottomHeight + spacing.lg));
  const projectionScope = `${mapScope}:${currentLine.id}:${viewportRevision}:${mapSize.width}:${mapSize.height}:${isActive}:${pathname}`;
  const previewScope = `${projectionScope}:${query}:${showStations}`;
  const previewStationId = preview.scope === previewScope && !mapMoving ? preview.stationId : null;

  const clearPreview = useCallback((kind?: 'hover' | 'hold') => {
    setPreview((current) => {
      if ((kind && current.kind !== kind) || current.stationId === null) return current;
      return { scope: current.scope, stationId: null, kind: null };
    });
  }, []);

  const previewAt = (point: { x: number; y: number }, kind: 'hover' | 'hold') => {
    if (mapMoving || !isActive || styleScope !== mapScope || projectedLabels.scope !== projectionScope) {
      clearPreview(kind);
      return;
    }
    const station = resolveRailStationScreenHit(stations, projectedLabels.points, point);
    setPreview((current) => {
      const stationId = station?.id ?? null;
      if (current.scope === previewScope && current.stationId === stationId && current.kind === kind) return current;
      return { scope: previewScope, stationId, kind: stationId ? kind : null };
    });
  };

  const projectLabels = useCallback(async () => {
    const revision = ++projectionRevision.current;
    const map = mapRef.current;
    if (!map || !isActive || styleScope !== mapScope) return;
    const projected = await Promise.all(stations.map(async (station) => {
      try {
        // Installed native implementations return DIP on Android and points on iOS.
        const [x, y] = await map.project([station.longitude, station.latitude]);
        return Number.isFinite(x) && Number.isFinite(y) ? { stationId: station.id, x, y } : null;
      } catch { return null; }
    }));
    if (revision !== projectionRevision.current) return;
    setProjectedLabels({ scope: projectionScope, points: projected.filter((point): point is ProjectedStation => point !== null) });
  }, [projectionScope, isActive, styleScope, mapScope, stations]);

  useEffect(() => {
    if (mapMoving) return;
    // End-of-gesture projection only; native labels must not capture station hit tests.
    const timer = setTimeout(() => { void projectLabels(); }, 80);
    return () => { clearTimeout(timer); projectionRevision.current += 1; };
  }, [projectLabels, mapMoving]);
  useEffect(() => {
    holdOrigin.current = null;
    // A fresh gesture explicitly re-enables selection; a finished hold never does.
    suppressSourceTap.current = true;
  }, [previewScope]);
  useEffect(() => () => { projectionRevision.current += 1; suppressSourceTap.current = true; holdOrigin.current = null; }, []);

  useEffect(() => {
    if (!mapStyle) return;
    let active = true;
    void fetchMapAttribution().then((value) => { if (active) setAttribution(value); });
    return () => { active = false; };
  }, [mapStyle]);

  useEffect(() => {
    if (!mapStyle) return;
    const timer = setTimeout(() => {
      if (loadedScopeRef.current === mapScope) return;
      setLoadIssue({ scope: mapScope, message: 'Map imagery is taking too long to load. The station catalog still works offline.' });
    }, MAP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [mapStyle, mapScope]);

  const focusStation = useCallback((station: RailStation) => {
    const labelPadding = { ...padding, right: Math.max(0, Math.min(mapSize.width - padding.left - 80, Math.max(padding.right, 160))) };
    cameraRef.current?.easeTo({ center: [station.longitude, station.latitude], zoom: 16, bearing: 0, pitch: 0, padding: labelPadding, duration: reduceMotion ? 0 : 350 });
  }, [padding, reduceMotion, mapSize.width]);
  const fitLine = useCallback(() => {
    if (!bounds) return;
    cameraRef.current?.fitBounds(bounds, { padding, duration: reduceMotion ? 0 : 350, bearing: 0, pitch: 0 });
    fittedScope.current = `${mapScope}:${currentLine.id}`;
  }, [bounds, padding, reduceMotion, mapScope, currentLine.id]);

  useEffect(() => {
    if (styleScope !== mapScope || !isActive) return;
    if (cameraIntent.current === 'station' && selected) focusStation(selected);
    else if (fittedScope.current !== `${mapScope}:${currentLine.id}`) fitLine();
  }, [selected, currentLine.id, styleScope, mapScope, isActive, focusStation, fitLine]);

  const chooseStation = (station: RailStation) => {
    if (!isActive || station.lineId !== currentLine.id) return;
    clearPreview();
    cameraIntent.current = 'station';
    onSelect(station.id);
    setQuery('');
    setBrowseOpen(false);
    setCatalogCollapsed(true);
    Keyboard.dismiss();
    focusStation(station);
  };
  const markReady = () => {
    loadedScopeRef.current = mapScope;
    setLoadedScope(mapScope);
    setLoadIssue((current) => current?.scope === mapScope ? undefined : current);
  };

  return (
    <View onLayout={(event) => {
      const { width, height } = event.nativeEvent.layout;
      if (width > 0 && height > 0) setMapSize((current) => current.width === width && current.height === height ? current : { width, height });
    }} style={[styles.root, { backgroundColor: colors.background }]}>
      {mapStyle ? <Map ref={mapRef} key={mapScope} style={StyleSheet.absoluteFill} mapStyle={mapStyle}
        accessibilityLabel={`Rail station map for ${currentLine.name}. Use Browse stations for an ordered list. Moving the map keeps your station selected.`}
        attribution logo compass={false} touchRotate={false} touchPitch={false} dragPan touchZoom doubleTapZoom doubleTapHoldZoom
        attributionPosition={{ bottom: ornamentBottom, right: spacing.sm }} logoPosition={{ bottom: ornamentBottom, left: spacing.sm }}
        onDidFinishLoadingStyle={() => setStyleScope(mapScope)} onDidFinishRenderingMapFully={markReady}
        onDidFailLoadingMap={() => setLoadIssue({ scope: mapScope, message: 'Map imagery could not load. Retry the map or use the offline station catalog.' })}
        onPress={() => undefined}
        onLongPress={(event) => {
          // MapLibre iOS requires an onPress listener to dispatch onLongPress.
          suppressSourceTap.current = true;
          const [x, y] = event.nativeEvent.point;
          holdOrigin.current = { x, y };
          previewAt({ x, y }, 'hold');
        }}
        onPointerMove={(event) => {
          const pointer = event.nativeEvent;
          if (pointer.pointerType !== 'mouse' && pointer.pointerType !== 'pen') return;
          if (pointer.buttons !== 0 || (pointer.pointerType === 'pen' && pointer.pressure > 0)) { clearPreview('hover'); return; }
          previewAt({ x: pointer.offsetX, y: pointer.offsetY }, 'hover');
        }}
        onPointerLeave={() => { holdOrigin.current = null; clearPreview(); }}
        onPointerCancel={() => { suppressSourceTap.current = true; holdOrigin.current = null; clearPreview(); }}
        onPointerDown={(event) => {
          if (event.nativeEvent.pointerType === 'mouse' || event.nativeEvent.pointerType === 'pen') suppressSourceTap.current = false;
          clearPreview('hover');
        }}
        onTouchStart={(event) => {
          suppressSourceTap.current = event.nativeEvent.touches.length > 1;
          holdOrigin.current = null;
          clearPreview();
        }}
        onTouchMove={(event) => {
          const touch = event.nativeEvent;
          if (touch.touches.length > 1) { suppressSourceTap.current = true; holdOrigin.current = null; clearPreview(); return; }
          if (holdOrigin.current && Math.hypot(touch.locationX - holdOrigin.current.x, touch.locationY - holdOrigin.current.y) > 8) {
            holdOrigin.current = null;
            clearPreview('hold');
          }
        }}
        onTouchEnd={() => { holdOrigin.current = null; clearPreview('hold'); }}
        onTouchCancel={() => { suppressSourceTap.current = true; holdOrigin.current = null; clearPreview(); }}
        onBlur={() => { suppressSourceTap.current = true; holdOrigin.current = null; clearPreview(); }}
        onRegionWillChange={() => { projectionRevision.current += 1; holdOrigin.current = null; clearPreview(); setMapMoving(true); }}
        onRegionDidChange={(event) => {
          if (Number.isFinite(event.nativeEvent.zoom)) setZoom(event.nativeEvent.zoom);
          setViewportRevision((current) => current + 1);
          setMapMoving(false);
        }}>
        <Camera ref={cameraRef} initialViewState={bounds ? { bounds, padding, bearing: 0, pitch: 0 } : { center: [120.9842, 14.5995], zoom: 12, bearing: 0, pitch: 0 }} minZoom={4} maxZoom={19} />
        {connection ? <GeoJSONSource id="rail-station-connections" data={connection}>
          <Layer id="rail-station-connection-line" type="line" paint={{ 'line-color': palette.rail, 'line-width': 4, 'line-opacity': 0.82 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
        </GeoJSONSource> : null}
        <GeoJSONSource id="rail-station-points" data={stationFeatures} hitbox={{ top: 24, right: 24, bottom: 24, left: 24 }}
          onPress={(event) => {
            event.stopPropagation();
            if (suppressSourceTap.current) return;
            const [longitude, latitude] = event.nativeEvent.lngLat;
            const hitStationIds = event.nativeEvent.features.flatMap((feature) => {
              const stationId = feature.properties?.stationId;
              return typeof stationId === 'string' ? [stationId] : [];
            });
            const station = resolveRailMapStationTap(stations, { latitude, longitude }, hitStationIds);
            if (station) chooseStation(station);
          }}>
          <Layer id="rail-station-circles" type="circle" paint={{
            'circle-radius': ['case', ['==', ['get', 'stationId'], selected?.id ?? ''], 17, ['==', ['get', 'stationId'], previewStationId ?? ''], 14, 11],
            'circle-radius-transition': { duration: reduceMotion ? 0 : 110, delay: 0 },
            'circle-color': ['case', ['==', ['get', 'stationId'], selected?.id ?? ''], colors.surface, palette.ball],
            'circle-stroke-color': palette.rail,
            'circle-stroke-width': ['case', ['==', ['get', 'stationId'], selected?.id ?? ''], 3, 1],
          }} />
        </GeoJSONSource>
      </Map> : <View pointerEvents="none" style={styles.unavailableBackdrop}>
        <Feather name="map" size={64} color={colors.line} />
      </View>}

      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        {!mapMoving && projectedLabels.scope === projectionScope ? projectedLabels.points.map((point) => {
          const station = getRailStation(point.stationId);
          if (!station || station.lineId !== currentLine.id || point.x < -180 || point.x > mapSize.width + 20 || point.y < -80 || point.y > mapHeight + 80) return null;
          const isSelected = selected?.id === station.id;
          const isPreview = previewStationId === station.id;
          if (!isSelected && !isPreview && zoom < LABEL_ZOOM) return null;
          const labelWidth = Math.min(150, Math.max(1, mapSize.width - spacing.xs * 2));
          const previewTopEdge = insets.top + spacing.xs + topHeight + spacing.sm;
          const keepLeft = isPreview && (point.x > mapSize.width / 2 || (floatingControlFits && point.y < previewTopEdge + 56));
          const preferredLeft = !keepLeft && point.x + 23 + labelWidth <= mapSize.width - spacing.xs ? point.x + 23 : point.x - 23 - labelWidth;
          const labelLeft = Math.max(spacing.xs, Math.min(mapSize.width - spacing.xs - labelWidth, preferredLeft));
          const previewBottomEdge = mapHeight - ornamentBottom - 72 - 13 * window.fontScale - spacing.xs;
          const previewLabelHeight = 34 * window.fontScale + 6;
          const labelTop = isPreview ? Math.max(previewTopEdge, Math.min(point.y - 12, previewBottomEdge - previewLabelHeight)) - point.y : -12;
          return <View key={station.id} style={[styles.projectedStation, { left: point.x, top: point.y, zIndex: isPreview ? 2 : isSelected ? 1 : 0 }]}>
            {isSelected ? <Feather name="check" size={16} color={palette.rail} style={styles.projectedCheck} /> : null}
            <Text style={[styles.projectedLabel, { left: labelLeft - point.x, top: labelTop, width: labelWidth, backgroundColor: colors.surface, color: colors.ink, borderColor: isSelected || isPreview ? palette.rail : colors.line, fontWeight: isSelected || isPreview ? '700' : '500' }]}>{station.name}</Text>
          </View>;
        }) : null}
      </View>

      <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={StyleSheet.absoluteFill}>
        <View pointerEvents="box-none" onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
          style={[styles.overlay, { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xs }]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={[styles.topPanel, { maxHeight: topLimit, backgroundColor: colors.surface, borderColor: colors.line }]}
            contentContainerStyle={styles.topContent} onLayout={(event) => setTopHeight(event.nativeEvent.layout.height)}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{title}</Text>
                <NavoPressable motion="none" accessibilityRole="button" onPress={onOtherDestinations} style={styles.otherButton}>
                  <Text style={[styles.otherText, { color: colors.accent }]}>Other destinations</Text>
                  <Feather name="chevron-right" size={14} color={colors.accent} />
                </NavoPressable>
              </View>
              <NavoPressable motion="compact" accessibilityRole="button" accessibilityLabel="Close rail station picker" onPress={onClose} style={styles.iconButton}>
                <Feather name="x" size={22} color={colors.ink} />
              </NavoPressable>
            </View>
            <View style={styles.lineOptions}>
              {railLines.map((line) => {
                const active = line.id === currentLine.id;
                const linePalette = getRailDiagramPalette(line.id, colors.isDark);
                return <NavoPressable key={line.id} motion="compact" accessibilityRole="radio" accessibilityState={{ checked: active }}
                  onPress={() => {
                    if (line.id === currentLine.id) return;
                    cameraIntent.current = 'line';
                    setQuery(''); setBrowseOpen(false); setCatalogCollapsed(false); Keyboard.dismiss(); onLineChange(line.id);
                  }} style={[styles.lineChip, { borderColor: active ? linePalette.rail : colors.line, backgroundColor: active ? linePalette.wash : colors.surface }]}>
                  <Text style={[styles.lineText, { color: active ? linePalette.text : colors.ink }]}>{line.name}</Text>
                </NavoPressable>;
              })}
            </View>
            <View style={[styles.search, { backgroundColor: colors.background, borderColor: colors.line }]}>
              <Feather name="search" size={18} color={colors.muted} />
              <TextInput accessibilityLabel={`Search stations on ${currentLine.name}`} placeholder="Search a station" placeholderTextColor={colors.quiet}
                value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="words" style={[styles.searchInput, { color: colors.ink }]} />
              {query ? <NavoPressable motion="none" accessibilityRole="button" accessibilityLabel="Clear station search" onPress={() => setQuery('')} style={styles.iconButton}>
                <Feather name="x-circle" size={18} color={colors.quiet} />
              </NavoPressable> : null}
            </View>
          </ScrollView>

          <View pointerEvents="box-none" style={[styles.mapSpace, { minHeight: mapGap }]}>
            {mapStyle && floatingControlFits ? <NavoPressable motion="compact" accessibilityRole="button" accessibilityLabel={`Show full ${currentLine.name} line`} onPress={() => { Keyboard.dismiss(); cameraIntent.current = 'line'; fitLine(); }}
              style={[styles.fitButton, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Feather name="maximize" size={17} color={colors.ink} /><Text style={[styles.fitText, { color: colors.ink }]}>Full line</Text>
            </NavoPressable> : null}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={[styles.bottomPanel, { maxHeight: bottomLimit, backgroundColor: colors.surface, borderColor: colors.line }]}
            contentContainerStyle={styles.bottomContent} onLayout={(event) => setBottomHeight(event.nativeEvent.layout.height)}>
            {!showStations ? selected ? <>
              <View style={styles.selectedHeading}>
                <View style={[styles.selectedIcon, { backgroundColor: palette.wash }]}><Feather name="check" size={20} color={palette.text} /></View>
                <View style={styles.selectedCopy}>
                  <Text accessibilityRole="header" style={[styles.stationTitle, { color: colors.ink }]}>{selected.name}</Text>
                  <Text style={[styles.supporting, { color: colors.muted }]}>{currentLine.name} · {selected.city}</Text>
                </View>
              </View>
              <NavoPressable accessibilityRole="button" accessibilityLabel={`Use ${selected.name} station and review alarm settings`} onPress={() => onConfirm(selected.id)}
                style={[styles.confirmButton, { backgroundColor: colors.accent }]}>
                <Text style={[styles.confirmText, { color: colors.onAccent }]}>Use station</Text><Feather name="arrow-right" size={18} color={colors.onAccent} />
              </NavoPressable>
            </> : <>
              <Text accessibilityRole="header" style={[styles.stationTitle, { color: colors.ink }]}>Choose a station</Text>
              <Text style={[styles.supporting, { color: colors.muted }]}>Tap a circle on the map or browse {stations.length} stations on {currentLine.name}.</Text>
            </> : null}
            <View style={styles.browseHeading}>
              <NavoPressable motion="none" accessibilityRole="button" accessibilityLabel={showStations ? 'Hide station list' : 'Browse stations'} accessibilityState={{ expanded: showStations }}
                onPress={() => {
                  Keyboard.dismiss();
                  if (showStations) { setQuery(''); setBrowseOpen(false); setCatalogCollapsed(true); }
                  else { setBrowseOpen(true); setCatalogCollapsed(false); }
                }} style={styles.browseButton}>
                <Feather name="list" size={16} color={colors.accent} />
                <Text style={[styles.browseText, { color: colors.accent }]}>{showStations ? 'Station list' : 'Browse stations'}</Text>
                <Feather name={showStations ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accent} />
              </NavoPressable>
              <Text style={[styles.count, { color: colors.muted }]}>{query.trim() ? `${results.length} matches` : `${stations.length} stations`}</Text>
            </View>
            {mapStyle && !floatingControlFits ? <NavoPressable motion="none" accessibilityRole="button" accessibilityLabel={`Show full ${currentLine.name} line`}
              onPress={() => { Keyboard.dismiss(); cameraIntent.current = 'line'; fitLine(); }} style={styles.retryButton}>
              <Feather name="maximize" size={16} color={colors.accent} /><Text style={[styles.browseText, { color: colors.accent }]}>Full line</Text>
            </NavoPressable> : null}
            {!imageryReady && !problem ? <View accessibilityLiveRegion="polite" style={styles.loadingRow}><ActivityIndicator size="small" color={colors.accent} /><Text style={[styles.supporting, { color: colors.muted }]}>Loading map imagery…</Text></View> : null}
            {problem ? <View style={styles.problem}>
              <Text accessibilityRole="alert" style={[styles.supporting, { color: colors.muted }]}>{problem}</Text>
              {mapStyle ? <NavoPressable motion="none" accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={styles.retryButton}>
                <Feather name="rotate-cw" size={15} color={colors.accent} /><Text style={[styles.browseText, { color: colors.accent }]}>Retry map</Text>
              </NavoPressable> : null}
            </View> : null}
            {storageProblem ? <View style={styles.problem}><Text accessibilityRole="alert" style={[styles.supporting, { color: colors.danger }]}>{storageProblem}</Text>
              {onRetryStorage ? <NavoPressable motion="none" accessibilityRole="button" onPress={onRetryStorage} style={styles.retryButton}><Text style={[styles.browseText, { color: colors.accent }]}>Retry saved data</Text></NavoPressable> : null}
            </View> : null}
            {showStations ? <View style={styles.list}>
              <Text style={[styles.listNote, { color: colors.muted }]}>{currentLine.id === 'lrt-2' ? 'Recto → Antipolo' : currentLine.direction.replace(' to ', ' → ')} · offline station catalog</Text>
              {results.length ? results.map((station) => <StationControl key={station.id} station={station} selected={selected?.id === station.id}
                palette={palette} position={stations.findIndex((item) => item.id === station.id) + 1} count={stations.length} lineName={currentLine.name} onSelect={chooseStation} />)
                : <Text accessibilityLiveRegion="polite" style={[styles.supporting, { color: colors.muted }]}>No stations match “{query.trim()}” on {currentLine.name}. Try another name or line.</Text>}
            </View> : null}
            <Text style={[styles.listNote, { color: colors.muted }]}>Connections between station points are approximate. Your alarm stays off until you enable it.</Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      {mapStyle ? <Text pointerEvents="none" style={[styles.attribution, { bottom: ornamentBottom + 72, backgroundColor: colors.surface, color: colors.muted }]}>{attribution ?? '© TomTom · © OpenStreetMap'}</Text> : null}
    </View>
  );
}

function StationControl({ station, selected, palette, position, count, lineName, onSelect }: {
  station: RailStation; selected: boolean; palette: RailDiagramPalette; position: number; count: number; lineName: string;
  onSelect: (station: RailStation) => void;
}) {
  const colors = useNavoColors();
  const { reduceMotion, isActive, pathname } = useMotionPreferences();
  const [scale] = useState(() => new Animated.Value(1));
  const focusScope = `${isActive}:${pathname}`;
  const [focusState, setFocusState] = useState({ scope: focusScope, focused: false });
  if (focusState.scope !== focusScope) setFocusState({ scope: focusScope, focused: false });
  const focused = focusState.scope === focusScope && focusState.focused && isActive;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const hovered = useRef(false);
  const pressed = useRef(false);
  const reset = useCallback(() => { animation.current?.stop(); scale.setValue(1); hovered.current = false; pressed.current = false; }, [scale]);
  const animate = (value: number, duration: number) => {
    animation.current?.stop();
    if (reduceMotion || !isActive) { scale.setValue(1); return; }
    animation.current = Animated.timing(scale, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false });
    animation.current.start();
  };
  useEffect(reset, [reset, pathname, isActive, reduceMotion]);
  useEffect(() => () => { reset(); scale.stopAnimation(); }, [reset, scale]);
  const ball = <View pointerEvents="none" style={styles.ballSpace}>
    {focused ? <View style={[styles.focusRing, { backgroundColor: colors.surface, borderColor: colors.ink }]} /> : null}
    {selected ? <View style={[styles.selectionRing, { backgroundColor: colors.surface, borderColor: palette.rail }]} /> : null}
    <Animated.View style={[styles.ball, { backgroundColor: selected ? colors.surface : palette.ball, borderColor: palette.ballEdge, transform: [{ scale }] }]}>
      {selected ? <Feather name="check" size={15} color={palette.rail} /> : null}
    </Animated.View>
  </View>;
  return <View collapsable={false} accessible={false}>
    <NavoPressable motion="none" accessible accessibilityRole="button" accessibilityState={{ selected }}
      accessibilityLabel={`${station.name} station, ${lineName}, ${position} of ${count}. Select station on the map.`}
      onPress={(event) => { event.stopPropagation(); if (isActive) onSelect(station); }}
      onPressIn={() => { pressed.current = true; animate(railDiagramMetrics.pressScale, railDiagramMetrics.pressDuration); }}
      onPressOut={() => { pressed.current = false; animate(hovered.current ? railDiagramMetrics.hoverScale : 1, railDiagramMetrics.releaseDuration); }}
      onHoverIn={() => { hovered.current = true; if (!pressed.current) animate(railDiagramMetrics.hoverScale, railDiagramMetrics.pressDuration); }}
      onHoverOut={() => { hovered.current = false; if (!pressed.current) animate(1, railDiagramMetrics.releaseDuration); }}
      onFocus={() => setFocusState({ scope: focusScope, focused: true })}
      onBlur={() => { reset(); setFocusState({ scope: focusScope, focused: false }); }} onTouchCancel={reset}
      style={[styles.stationRow, { borderBottomColor: colors.line, backgroundColor: selected ? palette.wash : colors.surface }]}>
      {ball}
      <View pointerEvents="none" style={styles.rowCopy}><Text style={[styles.rowName, { color: colors.ink }]}>{station.name}</Text><Text style={[styles.listNote, { color: colors.muted }]}>{station.city}</Text></View>
      {selected ? <Feather name="check" size={17} color={palette.text} /> : null}
    </NavoPressable>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  unavailableBackdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, paddingHorizontal: spacing.sm, gap: spacing.sm },
  topPanel: { flexGrow: 0, borderWidth: 1, borderRadius: 18, elevation: 5 },
  topContent: { padding: spacing.sm, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerCopy: { flex: 1 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  otherButton: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  otherText: { flexShrink: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  lineOptions: { flexDirection: 'row', gap: spacing.xs },
  lineChip: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, padding: spacing.xs },
  lineText: { fontSize: 13, lineHeight: 20, fontWeight: '700' },
  search: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.sm, borderWidth: 1, borderRadius: 12, gap: spacing.xs },
  searchInput: { flex: 1, minHeight: 48, fontSize: 14, paddingVertical: spacing.sm },
  mapSpace: { flex: 1, minHeight: 0, alignItems: 'flex-end', justifyContent: 'flex-start' },
  fitButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: 14, borderWidth: 1, elevation: 3 },
  fitText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  bottomPanel: { flexGrow: 0, borderWidth: 1, borderRadius: 18, elevation: 6 },
  bottomContent: { padding: spacing.md, gap: spacing.sm },
  selectedHeading: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  selectedIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  selectedCopy: { flex: 1, gap: 3 },
  stationTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  supporting: { fontSize: 13, lineHeight: 19, flexShrink: 1 },
  confirmButton: { minHeight: 50, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.sm },
  confirmText: { fontSize: 16, lineHeight: 23, fontWeight: '700', flexShrink: 1 },
  browseHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, flexWrap: 'wrap' },
  browseButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  browseText: { fontSize: 13, lineHeight: 19, fontWeight: '700', flexShrink: 1 },
  count: { fontSize: 12, lineHeight: 18 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  problem: { gap: spacing.xs },
  retryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  list: { gap: spacing.xs },
  listNote: { fontSize: 11, lineHeight: 16 },
  stationRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.xs },
  rowCopy: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  ballSpace: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  ball: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  selectionRing: { position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 3 },
  focusRing: { position: 'absolute', width: 42, height: 42, borderRadius: 21, borderWidth: 2 },
  projectedStation: { position: 'absolute' },
  projectedCheck: { position: 'absolute', left: -8, top: -8 },
  projectedLabel: { position: 'absolute', left: 23, top: -12, width: 150, fontSize: 12, lineHeight: 17, borderWidth: 1, borderRadius: 6, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  attribution: { position: 'absolute', left: 60, right: 60, fontSize: 9, lineHeight: 13, textAlign: 'center', paddingHorizontal: spacing.xs, borderRadius: 4 },
});
