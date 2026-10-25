import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { railLines } from '../../data/routes';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';
import { DataSeal, Divider, Screen, ScreenTitle, SectionTitle, Subtle } from '../../components/ui';

export default function RoutesScreen() {
  const colors = useNavoColors();
  const { customBusRoutes } = useAppState();
  return (
    <Screen>
      <ScreenTitle>Routes</ScreenTitle>
      <Subtle>Rail stop order is available offline. Location points are not bundled yet.</Subtle>
      <SectionTitle>Rail</SectionTitle>
      {railLines.map((line, index) => (
        <View key={line.id}>
          <Pressable accessibilityRole="button" onPress={() => router.push(`/trip/setup?lineId=${line.id}`)} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
            <View style={styles.rowTop}>
              <Text style={[styles.name, { color: colors.ink }]}>{line.name}</Text>
              <Text style={[styles.count, { color: colors.muted }]}>{line.stops.length} stops</Text>
            </View>
            <Text style={[styles.direction, { color: colors.muted }]}>{line.direction}</Text>
            <DataSeal label="Order only" tone="warning" />
          </Pressable>
          {index < railLines.length - 1 && <Divider />}
        </View>
      ))}
      <View style={styles.busHeader}>
        <SectionTitle>Bus routes</SectionTitle>
        <Pressable accessibilityRole="button" accessibilityLabel="Create a bus route" onPress={() => router.push('/bus/new')} hitSlop={8} style={styles.addButton}>
          <Feather name="plus" size={19} color={colors.accent} />
        </Pressable>
      </View>
      {customBusRoutes.length === 0 ? (
        <Subtle>No bus routes saved. Add stops in travel order; record stop locations to enable automatic checks.</Subtle>
      ) : customBusRoutes.map((route) => (
        <Pressable key={route.id} accessibilityRole="button" onPress={() => router.push(`/trip/setup?routeId=${route.id}`)} style={[styles.savedRoute, { borderBottomColor: colors.line }]}>
          <Text style={[styles.name, { color: colors.ink }]}>{route.name}</Text>
          <Text style={[styles.direction, { color: colors.muted }]}>{route.direction}</Text>
          <DataSeal label={route.coordinateStatus === 'complete' ? 'Rider locations saved' : 'Manual progress'} tone={route.coordinateStatus === 'complete' ? 'success' : 'warning'} />
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 15, gap: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  count: { fontSize: 13, fontWeight: '600' },
  direction: { fontSize: 14, lineHeight: 20 },
  busHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  addButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  savedRoute: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
});
