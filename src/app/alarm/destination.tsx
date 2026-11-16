import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, Map, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, Text, View } from 'react-native';
import { Screen, ScreenTitle, SecondaryButton, Subtle } from '../../components/ui';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';
import { hasValidCoordinates } from '../../domain/location-quality';
import { formatCoordinates } from '../../domain/coordinates';
import { createDestinationMapStyle } from '../../services/destination-map-style';

/** Saved coordinate viewer: camera gestures have no selection or persistence path. */
export default function AlarmDestinationScreen() {
  const app = useAppState();
  const colors = useNavoColors();
  const params = useLocalSearchParams<{ destinationId?: string }>();
  const destination = app.destinations.find((item) => item.id === params.destinationId);
  const style = useMemo(() => createDestinationMapStyle(colors.isDark), [colors.isDark]);
  const [attempt, setAttempt] = useState(0);
  const mapKey = `${attempt}:${colors.isDark}`;
  const [mapStatus, setMapStatus] = useState<{ key: string; problem: string | null } | null>(null);
  const loadedKey = useRef<string | null>(null);
  const problem = mapStatus?.key === mapKey ? mapStatus.problem : null;
  const camera = useRef<CameraRef>(null);
  useEffect(() => {
    if (!style) return;
    const timeout = setTimeout(() => {
      if (loadedKey.current !== mapKey) setMapStatus({ key: mapKey, problem: 'Map images are unavailable. Your saved destination and coordinates are still shown.' });
    }, 15_000);
    return () => clearTimeout(timeout);
  }, [style, mapKey]);
  const close = () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); };
  if (!app.ready || !destination || !hasValidCoordinates(destination)) {
    return <Screen><ScreenTitle>{!app.ready ? 'Loading destination' : 'Destination unavailable'}</ScreenTitle>
      <Subtle>{app.storageProblem ?? (!app.ready ? 'Reading your saved point.' : 'This destination may have been removed. Choose another saved alarm.')}</Subtle>
      {app.storageProblem ? <SecondaryButton title="Retry saved data" onPress={() => void app.refreshState()} /> : null}
      <SecondaryButton title="Back to alarms" onPress={() => router.replace('/(tabs)')} /></Screen>;
  }
  const position: [number, number] = [destination.longitude, destination.latitude];
  return <Screen footer={<SecondaryButton title="Back" onPress={close} />}>
    <ScreenTitle>{destination.name}</ScreenTitle>
    {destination.subtitle ? <Subtle>{destination.subtitle}</Subtle> : null}
    <View style={[styles.map, { backgroundColor: colors.raised }]}>
      {style ? <Map key={mapKey} style={StyleSheet.absoluteFill} mapStyle={style} attribution logo
        accessibilityLabel={`Saved location of ${destination.name}. Moving the map does not change this point.`}
        onDidFinishLoadingMap={() => { loadedKey.current = mapKey; setMapStatus({ key: mapKey, problem: null }); }}
        onDidFailLoadingMap={() => setMapStatus({ key: mapKey, problem: 'Map images could not load. The saved point below remains available.' })}>
        <Camera ref={camera} initialViewState={{ center: position, zoom: 16 }} minZoom={4} maxZoom={19} />
        <Marker id={`saved-${destination.id}`} lngLat={position} anchor="bottom">
          <Feather name="map-pin" size={42} color={colors.accent} />
        </Marker>
      </Map> : <View style={styles.unavailable}><Feather name="map-pin" size={30} color={colors.accent} /><Subtle>Saved location available. Map imagery needs a connection and map key.</Subtle></View>}
    </View>
    {problem ? <Text accessibilityRole="alert" style={[styles.problem, { color: colors.warning }]}>{problem}</Text> : null}
    <Text selectable style={[styles.coordinates, { color: colors.ink }]}>{formatCoordinates(destination)}</Text>
    <Subtle>This is your saved destination point. Panning the map does not change it.</Subtle>
    <SecondaryButton title="Focus destination" onPress={() => camera.current?.jumpTo({ center: position, zoom: 16 })} disabled={!style} />
    {problem ? <SecondaryButton title="Retry map images" onPress={() => setAttempt((value) => value + 1)} /> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  map: { height: 340, borderRadius: 14, overflow: 'hidden' },
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  coordinates: { fontSize: 16, lineHeight: 24, fontVariant: ['tabular-nums'] },
  problem: { fontSize: 14, lineHeight: 21 },
});
