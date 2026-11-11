import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { getAlarmDistancePresentation } from '../domain/alarm-distance-presentation';
import { useAppState } from '../state/AppStateProvider';
import { useLiveLocation } from '../state/live-location';
import { useNavoColors } from '../theme/colors';
import { NavoPressable } from './NavoPressable';

export function ActiveAlarmPanel() {
  const app = useAppState();
  const reading = useLiveLocation();
  const colors = useNavoColors();
  const [selectedAlarmId, setSelectedAlarmId] = useState<string | null>(app.settings.monitoringAlarmId ?? null);
  const [choosing, setChoosing] = useState(false);
  const [now, setNow] = useState(Date.now);
  const hasPanel = app.destinationAlarms.some((alarm) => (alarm.enabled || alarm.watchState === 'alerted')
    && app.destinations.some((destination) => destination.id === alarm.destinationId));

  useFocusEffect(useCallback(() => {
    if (!hasPanel) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const updateTimer = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (AppState.currentState === 'active') {
        setNow(Date.now());
        timer = setInterval(() => setNow(Date.now()), 5000);
      }
    };
    updateTimer();
    const subscription = AppState.addEventListener('change', updateTimer);
    return () => { if (timer !== null) clearInterval(timer); subscription.remove(); };
  }, [hasPanel]));

  const enabled = app.destinationAlarms.filter((alarm) => alarm.enabled && app.destinations.some((destination) => destination.id === alarm.destinationId))
    .sort((first, second) => (second.armedAt ?? 0) - (first.armedAt ?? 0));
  const latestAlert = app.destinationAlarms.filter((alarm) => alarm.watchState === 'alerted'
    && app.destinations.some((destination) => destination.id === alarm.destinationId))
    .sort((first, second) => (second.firedAt ?? 0) - (first.firedAt ?? 0))[0];
  const selected = app.destinationAlarms.find((alarm) => alarm.id === selectedAlarmId
    && (alarm.enabled || alarm.watchState === 'alerted') && app.destinations.some((destination) => destination.id === alarm.destinationId));
  const alarm = selected ?? enabled[0] ?? latestAlert;
  // Pin the initial default too: new alarms must not silently change the viewed destination.
  if (alarm && alarm.id !== selectedAlarmId) setSelectedAlarmId(alarm.id);
  const destination = app.destinations.find((item) => item.id === alarm?.destinationId);
  const displayedActiveAlarmId = alarm?.enabled ? alarm.id : null;
  const mutateState = app.mutateState;
  useEffect(() => {
    if (!displayedActiveAlarmId) return;
    // Persist display focus so a headless task uses the same destination in the
    // ongoing notification, without changing any alarm's enabled state.
    void mutateState((current) => current.settings.monitoringAlarmId === displayedActiveAlarmId
      || !current.destinationAlarms.some((item) => item.id === displayedActiveAlarmId && item.enabled)
      ? current
      : { ...current, settings: { ...current.settings, monitoringAlarmId: displayedActiveAlarmId } }).catch(() => undefined);
  }, [displayedActiveAlarmId, mutateState]);
  if (!alarm || !destination) return null;

  const options = selected && !selected.enabled ? [selected, ...enabled] : enabled;
  const presentation = getAlarmDistancePresentation(destination, alarm, reading, now);
  const statusColor = presentation.tone === 'warning' ? colors.warning : presentation.tone === 'success' ? colors.success : colors.muted;

  return (
    <View style={[styles.panel, { backgroundColor: colors.raised }]}>
      <Text accessibilityRole="header" style={[styles.destination, { color: colors.ink }]}>{destination.name}</Text>
      <Text style={[styles.distance, { color: colors.ink }]}>{presentation.distanceLabel ?? (presentation.status === 'locating' ? 'Waiting for GPS' : 'Distance unavailable')}</Text>
      <View style={styles.statusRow}>
        <Feather name={presentation.tone === 'warning' ? 'alert-circle' : presentation.status === 'alerted' ? 'check-circle' : 'navigation'} size={15} color={statusColor} />
        <Text style={[styles.status, { color: statusColor }]}>{presentation.statusLabel}</Text>
      </View>
      <Text style={[styles.detail, { color: colors.muted }]}>{presentation.detail}</Text>
      <Text style={[styles.estimate, { color: colors.muted }]}>
        Straight-line estimate{presentation.updatedLabel ? ` · ${presentation.updatedLabel}` : ''}
      </Text>
      {options.length > 1 ? (
        <>
          <NavoPressable
            motion="compact"
            accessibilityRole="button"
            accessibilityLabel="Choose which active destination to view"
            accessibilityState={{ expanded: choosing }}
            onPress={() => setChoosing((current) => !current)}
            style={styles.chooseButton}
          >
            <Text style={[styles.chooseText, { color: colors.accent }]}>Change destination · {enabled.length} active</Text>
            <Feather name={choosing ? 'chevron-up' : 'chevron-down'} size={17} color={colors.accent} />
          </NavoPressable>
          {choosing ? <View style={[styles.options, { borderTopColor: colors.line }]}>
            {options.map((option) => {
              const name = app.destinations.find((item) => item.id === option.destinationId)?.name;
              return (
                <NavoPressable
                  key={option.id}
                  motion="card"
                  accessibilityRole="radio"
                  accessibilityState={{ checked: option.id === alarm.id }}
                  accessibilityLabel={`${name}${option.enabled ? '' : option.pendingEvent ? ', alert pending' : ', alert sent'}`}
                  onPress={() => { setSelectedAlarmId(option.id); setChoosing(false); }}
                  style={styles.option}
                >
                  <Text style={[styles.optionText, { color: colors.ink }]}>{name}</Text>
                  {option.id === alarm.id ? <Feather name="check" size={18} color={colors.accent} /> : null}
                </NavoPressable>
              );
            })}
          </View> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8, padding: 16, borderRadius: 14 },
  destination: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.25 },
  distance: { fontSize: 28, lineHeight: 35, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  status: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  detail: { fontSize: 14, lineHeight: 20 },
  estimate: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  chooseButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 4, borderRadius: 10 },
  chooseText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  options: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 10 },
  optionText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
