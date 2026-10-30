import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavoMark } from '../../components/NavoMark';
import { DataSeal, Divider, Screen, ScreenTitle, Subtle } from '../../components/ui';
import { railLines } from '../../data/routes';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

export default function RoutesScreen() {
  const colors = useNavoColors();
  const app = useAppState();
  const { customBusRoutes } = app;
  return (
    <Screen tabBar>
      <View style={styles.brandRow}>
        <View style={styles.brandName}><NavoMark size={32} /><Text style={[styles.wordmark, { color: colors.ink }]}>Navo</Text></View>
        {app.firstRun.preferences.displayName ? <Text style={[styles.greeting, { color: colors.muted }]}>Hi, {app.firstRun.preferences.displayName.trim().split(/\s+/)[0]}</Text> : null}
      </View>

      <View style={styles.intro}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>YOUR NEXT TRIP</Text>
        <ScreenTitle>Plan a rail trip</ScreenTitle>
        <Subtle>Choose your line and stations before you go.</Subtle>
      </View>

      <View style={styles.sectionHeading}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>Rail lines</Text>
        <Text style={[styles.sectionDetail, { color: colors.muted }]}>Choose a line</Text>
      </View>
      <View style={[styles.lineList, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        {railLines.map((line, index) => (
          <View key={line.id}>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/trip/setup?lineId=${line.id}`)} style={({ pressed }) => [styles.lineRow, { opacity: pressed ? 0.76 : 1 }]}>
              <View style={[styles.lineIcon, { backgroundColor: colors.accentSoft }]}><Feather name="navigation" size={17} color={colors.accent} /></View>
              <View style={styles.lineCopy}>
                <View style={styles.lineNameRow}>
                  <Text style={[styles.lineName, { color: colors.ink }]}>{line.name}</Text>
                  <Text style={[styles.count, { color: colors.muted }]}>{line.stops.length} stops</Text>
                </View>
                <Text style={[styles.direction, { color: colors.muted }]}>{line.direction}</Text>
                <DataSeal label="Station order only" tone="warning" />
              </View>
              <Feather name="chevron-right" size={18} color={colors.quiet} />
            </Pressable>
            {index < railLines.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </View>
      <Subtle style={styles.hint}>Station coordinates are not included yet. Rail trips can follow stop order with manual progress; automatic location checks need mapped stops.</Subtle>

      <View style={styles.busHeader}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>Bus routes</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Create a bus route" onPress={() => router.push('/bus/new')} style={[styles.addButton, { backgroundColor: colors.accentSoft }]}>
          <Feather name="plus" size={18} color={colors.accent} />
        </Pressable>
      </View>
      {customBusRoutes.length === 0 ? (
        <View style={[styles.emptyBus, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Feather name="map" size={17} color={colors.accent} />
          <Subtle style={styles.busEmptyText}>Add your own bus stops in travel order. Record locations to enable automatic checks.</Subtle>
        </View>
      ) : customBusRoutes.map((route) => (
        <Pressable key={route.id} accessibilityRole="button" onPress={() => router.push(`/trip/setup?routeId=${route.id}`)} style={[styles.savedRoute, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.savedRouteCopy}>
            <Text style={[styles.lineName, { color: colors.ink }]}>{route.name}</Text>
            <Text style={[styles.direction, { color: colors.muted }]}>{route.direction}</Text>
          </View>
          <DataSeal label={route.coordinateStatus === 'complete' ? 'Mapped' : 'Manual progress'} tone={route.coordinateStatus === 'complete' ? 'success' : 'warning'} />
          <Feather name="chevron-right" size={18} color={colors.quiet} />
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { fontSize: 18, fontWeight: '700', letterSpacing: -0.35 },
  greeting: { fontSize: 12, fontWeight: '600' },
  intro: { gap: 5 },
  eyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.45 },
  sectionHeading: { minHeight: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  sectionDetail: { fontSize: 11, fontWeight: '600' },
  lineList: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  lineRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9 },
  lineIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  lineCopy: { flex: 1, gap: 3 },
  lineNameRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  lineName: { fontSize: 14, fontWeight: '700' },
  count: { fontSize: 11, fontWeight: '600' },
  direction: { fontSize: 11, lineHeight: 15 },
  hint: { fontSize: 11, lineHeight: 16, marginTop: -4 },
  busHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  addButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  emptyBus: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderRadius: 13 },
  busEmptyText: { flex: 1, fontSize: 11, lineHeight: 16 },
  savedRoute: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, borderWidth: 1, borderRadius: 13 },
  savedRouteCopy: { flex: 1, gap: 3 },
});
