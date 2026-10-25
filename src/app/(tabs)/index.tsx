import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, DataSeal, Divider, RouteLine, Screen, ScreenTitle, SectionTitle, Subtle } from '../../components/ui';
import { NavoMark } from '../../components/NavoMark';
import { railLines } from '../../data/routes';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

export default function RideHomeScreen() {
  const colors = useNavoColors();
  const app = useAppState();
  const startSetup = (lineId: string) => router.push('/trip/setup?lineId=' + lineId);

  return (
    <Screen>
      <View style={styles.brandRow}>
        <View style={styles.brandName}>
          <NavoMark size={42} />
          <Text style={[styles.wordmark, { color: colors.ink }]}>Navo</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} hitSlop={10} style={styles.settingsButton}>
          <Feather name="sliders" size={20} color={colors.muted} />
        </Pressable>
      </View>

      {app.activeTrip && app.activeRoute ? (
        <View style={styles.activeSection}>
          <View style={styles.activeTopline}>
            <ScreenTitle>Your trip is ready</ScreenTitle>
            <DataSeal label="Active" tone="success" />
          </View>
          <Body>{app.activeRoute.name} · toward {app.activeRoute.stops[app.activeTrip.destinationIndex]?.name}</Body>
          <Subtle>{app.activeRoute.coordinateStatus === 'complete' ? 'Location route recorded by you' : 'Station sequence saved · manual progress'}</Subtle>
          <Pressable accessibilityRole="button" onPress={() => router.push('/trip/active')} style={[styles.activeLink, { borderColor: colors.line }]}>
            <Text style={[styles.activeLinkText, { color: colors.accent }]}>Return to trip</Text>
            <Feather name="arrow-up-right" size={17} color={colors.accent} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.intro}>
          <ScreenTitle>Where are you heading?</ScreenTitle>
          <Subtle>Choose a line and destination. Navo keeps your stop sequence on this device.</Subtle>
        </View>
      )}

      <View style={styles.section}>
        <SectionTitle accessory={<Subtle>{railLines.reduce((total, line) => total + line.stops.length, 0)} stations</Subtle>}>Rail lines</SectionTitle>
        {railLines.map((line, index) => (
          <View key={line.id}>
            <Pressable accessibilityRole="button" accessibilityLabel={'Choose ' + line.name + ', ' + line.direction} onPress={() => startSetup(line.id)} style={({ pressed }) => [styles.routeRow, { opacity: pressed ? 0.68 : 1 }]}>
              <View style={styles.routeHeading}>
                <Text style={[styles.routeName, { color: colors.ink }]}>{line.name}</Text>
                <Text style={[styles.routeCount, { color: colors.muted }]}>{line.stops.length} stops</Text>
              </View>
              <Text style={[styles.routeDirection, { color: colors.muted }]}>{line.direction}</Text>
              <RouteLine total={Math.min(line.stops.length, 7)} />
              <View style={styles.routeFoot}>
                <DataSeal label="Sequence ready" tone="neutral" />
                <Feather name="chevron-right" size={18} color={colors.quiet} />
              </View>
            </Pressable>
            {index < railLines.length - 1 && <Divider />}
          </View>
        ))}
      </View>

      <View style={styles.busSection}>
        <SectionTitle>Riding a bus?</SectionTitle>
        <Subtle>Create a stop list. Add each stop&apos;s location while you are there to enable location checks.</Subtle>
        <Pressable accessibilityRole="button" onPress={() => router.push('/bus/new')} style={({ pressed }) => [styles.busButton, { borderColor: colors.line, opacity: pressed ? 0.72 : 1 }]}>
          <Feather name="plus" size={18} color={colors.accent} />
          <Text style={[styles.busButtonText, { color: colors.ink }]}>Make a bus route</Text>
          <Feather name="arrow-right" size={17} color={colors.muted} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 },
  brandName: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  wordmark: { fontSize: 21, fontWeight: '700', letterSpacing: -0.5 },
  settingsButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  intro: { gap: 9, paddingTop: 17, paddingBottom: 4 },
  activeSection: { gap: 12, paddingTop: 12, paddingBottom: 5 },
  activeTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  activeLink: { minHeight: 48, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12 },
  activeLinkText: { fontSize: 15, fontWeight: '700' },
  section: { gap: 7 },
  routeRow: { paddingVertical: 17, gap: 9 },
  routeHeading: { flexDirection: 'row', alignItems: 'baseline', gap: 11 },
  routeName: { fontSize: 21, fontWeight: '700', letterSpacing: -0.35 },
  routeCount: { fontSize: 13, fontWeight: '600' },
  routeDirection: { fontSize: 14, lineHeight: 19 },
  routeFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  busSection: { gap: 12, paddingTop: 5 },
  busButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderWidth: 1, borderRadius: 13 },
  busButtonText: { flex: 1, marginLeft: 12, fontSize: 15, fontWeight: '600' },
});