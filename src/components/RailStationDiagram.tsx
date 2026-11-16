import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { RailStation } from '../data/rail-stations';
import { spacing, useNavoColors } from '../theme/colors';
import { useMotionPreferences } from './MotionPreferencesProvider';
import { NavoPressable } from './NavoPressable';
import { createRailDiagramLayout, type RailDiagramNode } from './rail-diagram-layout';
import { getRailDiagramPalette, railDiagramMetrics, type RailDiagramPalette } from './rail-diagram-tokens';

interface RailStationDiagramProps {
  lineId: string;
  lineName: string;
  /** Complete line in picker presentation order, including when search is active. */
  stations: readonly RailStation[];
  /** Undefined restores the schematic; even adjacent search matches use separate circles. */
  visibleStationIds?: readonly string[];
  selectedStationId?: string;
  onSelect: (station: RailStation) => void;
}

export function RailStationDiagram({ lineId, lineName, stations, visibleStationIds, selectedStationId, onSelect }: RailStationDiagramProps) {
  const colors = useNavoColors();
  const window = useWindowDimensions();
  // Keep route traversal top to bottom until the native screen-reader setting is known.
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(true);
  const [measuredWidth, setMeasuredWidth] = useState<number>();
  const width = measuredWidth ?? Math.max(48, window.width - 40);
  const fontScale = window.fontScale;
  const measurementScope = `${lineId}:${width}:${fontScale}:${screenReaderEnabled}:${visibleStationIds === undefined ? 'diagram' : 'search'}`;
  const [measurements, setMeasurements] = useState<{ scope: string; heights: Record<string, number> }>({ scope: measurementScope, heights: {} });
  const visibleStations = useMemo(() => {
    if (visibleStationIds === undefined) return stations;
    const matchingIds = new Set(visibleStationIds);
    return stations.filter((station) => matchingIds.has(station.id));
  }, [stations, visibleStationIds]);
  const layout = useMemo(() => createRailDiagramLayout({
    lineId, stations: visibleStations, width, fontScale,
    labelHeights: measurements.scope === measurementScope ? measurements.heights : {},
    searchResults: visibleStationIds !== undefined, stackTopStations: screenReaderEnabled,
  }), [lineId, visibleStations, width, fontScale, measurements, measurementScope, visibleStationIds, screenReaderEnabled]);
  const palette = getRailDiagramPalette(lineId, colors.isDark);
  const stationsById = useMemo(() => new Map(stations.map((station, index) => [station.id, { station, position: index + 1 }])), [stations]);
  const measureLabel = useCallback((id: string, height: number) => {
    setMeasurements((current) => {
      const heights = current.scope === measurementScope ? current.heights : {};
      if (Math.abs((heights[id] ?? 0) - height) < 1) return current;
      return { scope: measurementScope, heights: { ...heights, [id]: height } };
    });
  }, [measurementScope]);

  useEffect(() => {
    let mounted = true;
    let settingRevision = 0;
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      settingRevision += 1;
      if (mounted) setScreenReaderEnabled(enabled);
    });
    const requestRevision = settingRevision;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted && requestRevision === settingRevision) setScreenReaderEnabled(enabled);
    }).catch(() => {
      if (mounted && requestRevision === settingRevision) setScreenReaderEnabled(true);
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  return (
    <View accessible={false}
      onLayout={(event) => {
      const nextWidth = event.nativeEvent.layout.width;
      if (nextWidth > 0) setMeasuredWidth((current) => current !== nextWidth ? nextWidth : current);
    }} style={[styles.diagram, { height: layout.height }]}>
      {layout.connectorPath ? (
        <Svg accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" width={layout.width} height={layout.height} style={StyleSheet.absoluteFill}>
          <Path d={layout.connectorPath} fill="none" stroke={palette.rail} strokeWidth={railDiagramMetrics.railWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : null}
      {layout.nodes.map((node) => {
        const entry = stationsById.get(node.stationId);
        if (!entry) return null;
        return <StationTarget key={node.stationId} node={node} station={entry.station} lineName={lineName}
          position={entry.position} stationCount={stations.length} palette={palette}
          selected={selectedStationId === node.stationId} onSelect={onSelect} onLabelHeight={measureLabel} />;
      })}
    </View>
  );
}

function StationTarget({ node, station, lineName, position, stationCount, palette, selected, onSelect, onLabelHeight }: {
  node: RailDiagramNode;
  station: RailStation;
  lineName: string;
  position: number;
  stationCount: number;
  palette: RailDiagramPalette;
  selected: boolean;
  onSelect: (station: RailStation) => void;
  onLabelHeight: (id: string, height: number) => void;
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
  const reset = useCallback(() => {
    animation.current?.stop();
    scale.setValue(1);
    hovered.current = false;
    pressed.current = false;
  }, [scale]);
  const animate = (value: number, duration: number) => {
    animation.current?.stop();
    if (reduceMotion || !isActive) { scale.setValue(1); return; }
    animation.current = Animated.timing(scale, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false });
    animation.current.start();
  };

  useEffect(reset, [isActive, pathname, reduceMotion, reset]);
  useEffect(() => () => { reset(); scale.stopAnimation(); }, [reset, scale]);

  return (
    <NavoPressable motion="none" accessible accessibilityRole="button"
      accessibilityLabel={`${station.name} station, ${lineName}, ${position} of ${stationCount}. Confirm station location on the map.`}
      accessibilityState={{ selected }}
      onPress={() => { if (isActive) onSelect(station); }}
      onPressIn={() => {
        pressed.current = true;
        animate(railDiagramMetrics.pressScale, railDiagramMetrics.pressDuration);
      }}
      onPressOut={() => {
        pressed.current = false;
        animate(hovered.current ? railDiagramMetrics.hoverScale : 1, railDiagramMetrics.releaseDuration);
      }}
      onHoverIn={() => {
        hovered.current = true;
        if (!pressed.current) animate(railDiagramMetrics.hoverScale, railDiagramMetrics.pressDuration);
      }}
      onHoverOut={() => {
        hovered.current = false;
        if (!pressed.current) animate(1, railDiagramMetrics.releaseDuration);
      }}
      onFocus={() => setFocusState({ scope: focusScope, focused: true })}
      onBlur={() => { reset(); setFocusState({ scope: focusScope, focused: false }); }}
      onTouchCancel={reset}
      style={[styles.target, { left: node.target.x, top: node.target.y, width: node.target.width, height: node.target.height }]}>
      <View pointerEvents="none" accessible={false} style={[styles.nodeSpace, {
        left: node.x - node.target.x - railDiagramMetrics.targetSize / 2,
        top: node.y - node.target.y - railDiagramMetrics.targetSize / 2,
      }]}>
        {focused ? <View style={[styles.focusRing, { borderColor: colors.ink, backgroundColor: colors.background }]} /> : null}
        {selected ? <View style={[styles.selectionRing, { borderColor: palette.rail, backgroundColor: colors.background }]} /> : null}
        <Animated.View style={[styles.ball, {
          backgroundColor: selected ? colors.surface : palette.ball,
          borderColor: selected ? palette.rail : palette.ballEdge,
          shadowColor: palette.ballEdge,
          transform: [{ scale }],
        }]}>
          {selected ? <Feather name="check" size={16} color={palette.rail} /> : null}
        </Animated.View>
      </View>
      <Text accessible={false} pointerEvents="none" onLayout={(event) => onLabelHeight(station.id, event.nativeEvent.layout.height)} style={[styles.label, {
        color: colors.ink, left: node.label.x - node.target.x, top: node.label.y - node.target.y,
        width: node.label.width, textAlign: node.label.textAlign,
      }]}>{station.name}</Text>
    </NavoPressable>
  );
}

const styles = StyleSheet.create({
  diagram: { width: '100%', marginTop: spacing.xs, marginBottom: spacing.sm },
  target: { position: 'absolute' },
  nodeSpace: { position: 'absolute', width: railDiagramMetrics.targetSize, height: railDiagramMetrics.targetSize, alignItems: 'center', justifyContent: 'center' },
  ball: { width: railDiagramMetrics.ballSize, height: railDiagramMetrics.ballSize, borderRadius: railDiagramMetrics.ballSize / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 1, elevation: 1 },
  selectionRing: { position: 'absolute', width: railDiagramMetrics.selectedSize, height: railDiagramMetrics.selectedSize, borderRadius: railDiagramMetrics.selectedSize / 2, borderWidth: 3 },
  focusRing: { position: 'absolute', width: 42, height: 42, borderRadius: 21, borderWidth: 2 },
  label: { position: 'absolute', fontSize: railDiagramMetrics.labelFontSize, lineHeight: railDiagramMetrics.labelLineHeight, fontWeight: '600' },
});
