import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ALERT_DISTANCE_OPTIONS_M } from '../domain/destination-alarm';
import { useNavoColors } from '../theme/colors';
import { NavoPressable } from './NavoPressable';

interface Props {
  distances: number[];
  onDistancesChange: (distances: number[]) => void;
  arrival: boolean;
  onArrivalChange: (enabled: boolean) => void;
  missed: boolean;
  onMissedChange: (enabled: boolean) => void;
  vibration: boolean;
  onVibrationChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export function AlarmAlertSettings(props: Props) {
  const colors = useNavoColors();
  const row = (label: string, detail: string, value: boolean, onChange: (enabled: boolean) => void) => (
    <View style={[styles.row, { borderTopColor: colors.line }]}>
      <View style={styles.copy}>
        <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
        <Text style={[styles.detail, { color: colors.muted }]}>{detail}</Text>
      </View>
      <Switch accessibilityLabel={label} accessibilityHint={detail} value={value} onValueChange={onChange}
        disabled={props.disabled} style={styles.switch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        trackColor={{ false: colors.line, true: colors.accent }} thumbColor="#FFFFFF" />
    </View>
  );
  const choices = [...new Set([...ALERT_DISTANCE_OPTIONS_M, ...props.distances])].sort((a, b) => a - b);
  return (
    <View style={styles.section}>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Repeat alerts</Text>
        <Text style={[styles.detail, { color: colors.muted }]}>Choose one or more distances. Each selected alert sounds once per trip.</Text>
      </View>
      <Text style={[styles.label, { color: colors.ink }]}>When I’m close</Text>
      <View style={styles.choices}>
        {choices.map((distance) => {
          const selected = props.distances.includes(distance);
          const label = distance >= 1000 ? `${distance / 1000} km` : `${distance} m`;
          return <NavoPressable key={distance} motion="compact" accessibilityRole="checkbox"
            accessibilityLabel={`Alert at ${label}`} accessibilityState={{ checked: selected, disabled: props.disabled }}
            disabled={props.disabled} onPress={() => props.onDistancesChange(selected
              ? props.distances.filter((value) => value !== distance) : [...props.distances, distance].sort((a, b) => a - b))}
            style={[styles.chip, { borderColor: selected ? colors.accent : colors.line, backgroundColor: selected ? colors.accentSoft : colors.surface }]}>
            <Feather name={selected ? 'check-square' : 'square'} size={17} color={selected ? colors.accent : colors.muted} />
            <Text style={[styles.chipText, { color: selected ? colors.accent : colors.ink }]}>{label}</Text>
          </NavoPressable>;
        })}
      </View>
      <Text style={[styles.detail, { color: colors.muted }]}>Distances are straight-line estimates. A GPS jump can skip an earlier reminder.</Text>
      {row('At my destination', 'After two accurate readings within the 100 m destination area.', props.arrival, props.onArrivalChange)}
      {row('May have passed my stop', 'After a close approach and sustained movement away. GPS cannot tell whether you got off.', props.missed, props.onMissedChange)}
      {Platform.OS === 'android'
        ? row('Vibrate with alerts', 'Uses vibration when allowed by your phone’s notification settings.', props.vibration, props.onVibrationChange)
        : <Text style={[styles.detail, { color: colors.muted }]}>Vibration follows your iPhone’s notification settings.</Text>}
      {props.missed ? <Text style={[styles.detail, { color: colors.muted }]}>Turn this alarm off once you get off. Passed-stop checks are limited to about 10 minutes after arrival.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  copy: { flex: 1, gap: 4 },
  title: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  label: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  detail: { fontSize: 13, lineHeight: 19 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 86, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '700' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  switch: { minWidth: 48, minHeight: 48 },
});
