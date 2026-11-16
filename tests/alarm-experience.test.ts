import { describe, expect, it, vi } from 'vitest';
import { ALARM_ALERT_LIFETIME_MS, applyAlarmAlertAction, getAlarmAlert, getCurrentAlarmAlerts, type AlarmAlertReference } from '../src/domain/alarm-experience';
import { armDestinationAlarm, createDestinationAlarm, disarmDestinationAlarm, evaluateDestinationAlarmFix, normalizeDestinationAlarm } from '../src/domain/destination-alarm';
import type { DestinationAlarm, DestinationAlarmEvent, SavedDestination } from '../src/domain/models';
import { defaultAppState, normalizeAppState, type StoredAppState } from '../src/services/storage';

vi.mock('expo-sqlite', () => ({}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

const now = 10_000;
const destination: SavedDestination = {
  id: 'stop', name: 'Saved station', latitude: 14.6, longitude: 121,
  kind: 'rail-station', source: 'map-pin', createdAt: '', updatedAt: '',
};
function withEvents(stages: DestinationAlarmEvent['stage'][] = ['approaching']): StoredAppState {
  const alarm = armDestinationAlarm(createDestinationAlarm('alarm', destination.id), 'session', 0);
  const alertEvents = stages.map((stage, index): DestinationAlarmEvent => ({
    id: `session:${stage}`, alarmId: alarm.id, destinationId: destination.id, sessionId: 'session', stage,
    occurredAt: now - 2_000 + index * 1_000, distanceM: stage === 'arrived' ? 40 : 400, message: 'Stop update.',
  }));
  return { ...defaultAppState, destinations: [destination], destinationAlarms: [{ ...alarm, watchState: 'monitoring',
    firedAt: alertEvents.at(-1)?.occurredAt ?? null, alertEvents, pendingEvents: alertEvents.map((event) => ({ ...event })) }] };
}
function ref(eventId = 'session:approaching'): AlarmAlertReference {
  return { alarmId: 'alarm', sessionId: 'session', eventId };
}
function acceptedFix(alarm: DestinationAlarm, distance: number, timestamp: number) {
  return evaluateDestinationAlarmFix(destination, alarm, { latitude: destination.latitude + distance / 111_195,
    longitude: destination.longitude, accuracyM: 10, timestamp }, timestamp).alarm;
}

describe('durable destination alert screens', () => {
  it('retains screen events independently of the notification retry queue', () => {
    let alarm: DestinationAlarm = { ...armDestinationAlarm(createDestinationAlarm('alarm', destination.id), 'session', 0), watchState: 'monitoring' };
    alarm = acceptedFix(alarm, 400, 1000);
    alarm = acceptedFix(alarm, 350, 2000);
    const close = alarm.alertEvents[0];
    expect(close.stage).toBe('approaching');
    alarm = acceptedFix(alarm, 50, 3000);
    alarm = acceptedFix(alarm, 40, 4000);
    expect(alarm.pendingEvents.map((event) => event.stage)).toEqual(['arrived']);
    expect(alarm.alertEvents.map((event) => event.stage)).toEqual(['approaching', 'arrived']);
    expect(alarm.alertEvents[0]).toEqual(close);
    expect(close.distanceM).toBe(350);
    const state = { ...defaultAppState, destinations: [destination], destinationAlarms: [alarm] };
    expect(getCurrentAlarmAlerts(state, 4000)[0].event.stage).toBe('arrived');
    expect(getAlarmAlert(state, { ...ref(), eventId: close.id }, 4000)?.event.stage).toBe('approaching');
  });

  it('persists presentation without acknowledging or disabling this alarm', () => {
    const original = withEvents();
    const result = applyAlarmAlertAction(original, ref(), 'present', now);
    expect(result.outcome).toBe('applied');
    expect(result.state.destinationAlarms[0].presentedEventIds).toEqual(['session:approaching']);
    expect(result.state.destinationAlarms[0].pendingEvents).toEqual(original.destinationAlarms[0].pendingEvents);
    expect(result.state.destinationAlarms[0].enabled).toBe(true);
    const repeated = applyAlarmAlertAction(result.state, ref(), 'present', now);
    expect(repeated.outcome).toBe('already-handled');
    expect(repeated.state).toBe(result.state);
    expect(normalizeAppState(JSON.parse(JSON.stringify(result.state))).destinationAlarms[0].presentedEventIds).toEqual(['session:approaching']);
  });

  it('mutes the selected event while retaining later stages and other alarms', () => {
    const original = withEvents(['approaching', 'arrived']);
    const otherAlarm = armDestinationAlarm(createDestinationAlarm('other-alarm', destination.id), 'other-session', 0);
    original.destinationAlarms.push(otherAlarm);
    const result = applyAlarmAlertAction(original, ref(), 'acknowledge', now);
    expect(result.outcome).toBe('applied');
    expect(result.state.destinationAlarms[0].enabled).toBe(true);
    expect(result.state.destinationAlarms[0].alertEvents.map((event) => event.stage)).toEqual(['arrived']);
    expect(result.state.destinationAlarms[0].pendingEvents.map((event) => event.stage)).toEqual(['arrived']);
    expect(result.state.destinationAlarms[1]).toBe(otherAlarm);
    expect(original.destinationAlarms[0].alertEvents).toHaveLength(2);
  });

  it('silences one cue and its delivery retry while retaining its screen and later stages', () => {
    const original = withEvents(['approaching', 'arrived']);
    const result = applyAlarmAlertAction(original, ref(), 'silence', now);
    expect(result.outcome).toBe('applied');
    expect(result.state.destinationAlarms[0].enabled).toBe(true);
    expect(result.state.destinationAlarms[0].alertEvents).toEqual(original.destinationAlarms[0].alertEvents);
    expect(result.state.destinationAlarms[0].pendingEvents.map((event) => event.stage)).toEqual(['arrived']);
    expect(result.state.destinationAlarms[0].presentedEventIds).toEqual(['session:approaching']);
    expect(getAlarmAlert(result.state, ref(), now)?.event.stage).toBe('approaching');
    const repeated = applyAlarmAlertAction(result.state, ref(), 'silence', now);
    expect(repeated.outcome).toBe('already-handled');
    expect(repeated.state).toBe(result.state);
  });

  it('silences an already presented event when its delivery is still queued', () => {
    const presented = applyAlarmAlertAction(withEvents(), ref(), 'present', now).state;
    const result = applyAlarmAlertAction(presented, ref(), 'silence', now);
    expect(result.outcome).toBe('applied');
    expect(result.state.destinationAlarms[0].pendingEvents).toEqual([]);
    expect(result.state.destinationAlarms[0].alertEvents).toHaveLength(1);
    expect(result.state.destinationAlarms[0].presentedEventIds).toEqual(['session:approaching']);
  });

  it('does not silence a newer session using a stale screen reference', () => {
    const original = withEvents();
    const rearmed = { ...original, destinationAlarms: [armDestinationAlarm(original.destinationAlarms[0], 'new-session', now)] };
    const result = applyAlarmAlertAction(rearmed, ref(), 'silence', now);
    expect(result.outcome).toBe('ended');
    expect(result.state).toBe(rearmed);
    expect(rearmed.destinationAlarms[0].enabled).toBe(true);
  });

  it('does not resurrect an old close alert after the newer arrival is muted', () => {
    const original = withEvents(['approaching', 'arrived']);
    const result = applyAlarmAlertAction(original, ref('session:arrived'), 'acknowledge', now);
    expect(getCurrentAlarmAlerts(result.state, now)).toEqual([]);
    expect(getAlarmAlert(result.state, ref(), now)?.event.stage).toBe('approaching');
    expect(getCurrentAlarmAlerts(normalizeAppState(JSON.parse(JSON.stringify(result.state))), now)).toEqual([]);
  });

  it('completes only an arrival event in its current destination session', () => {
    const original = withEvents(['arrived']);
    const otherAlarm = armDestinationAlarm(createDestinationAlarm('other-alarm', destination.id), 'other-session', 0);
    original.destinationAlarms.push(otherAlarm);
    const result = applyAlarmAlertAction(original, ref('session:arrived'), 'complete', now);
    expect(result.outcome).toBe('applied');
    expect(result.state.destinationAlarms[0]).toMatchObject({ enabled: false, sessionId: null, alertEvents: [], pendingEvents: [], presentedEventIds: [] });
    expect(result.state.destinationAlarms[1]).toBe(otherAlarm);
    expect(result.state.activeTrip).toBe(original.activeTrip);
    expect(result.state.activeRoute).toBe(original.activeRoute);
    expect(result.state.destinations).toBe(original.destinations);
    expect(applyAlarmAlertAction(withEvents(), ref(), 'complete', now).outcome).toBe('invalid-action');
  });

  it('cannot stop a new session from an old confirmation or deleted destination', () => {
    const original = withEvents(['arrived']);
    const rearmed = { ...original, destinationAlarms: [armDestinationAlarm(original.destinationAlarms[0], 'new-session', now)] };
    const result = applyAlarmAlertAction(rearmed, ref('session:arrived'), 'end', now);
    expect(result.outcome).toBe('ended');
    expect(result.state).toBe(rearmed);
    expect(applyAlarmAlertAction({ ...original, destinations: [] }, ref('session:arrived'), 'complete', now).outcome).toBe('ended');
  });

  it('treats a duplicate acknowledgment as a no-op', () => {
    const acknowledged = applyAlarmAlertAction(withEvents(), ref(), 'acknowledge', now).state;
    const repeated = applyAlarmAlertAction(acknowledged, ref(), 'acknowledge', now);
    expect(repeated.outcome).toBe('already-handled');
    expect(repeated.state).toBe(acknowledged);
    expect(normalizeAppState(acknowledged).destinationAlarms[0].alertEvents).toEqual([]);
  });

  it('does not offer stale or future events or act on them as a current stop', () => {
    const original = withEvents();
    const expiredNow = now + ALARM_ALERT_LIFETIME_MS;
    expect(getCurrentAlarmAlerts(original, expiredNow)).toEqual([]);
    expect(getAlarmAlert(original, ref(), expiredNow)).toBeNull();
    expect(applyAlarmAlertAction(original, ref(), 'end', expiredNow).outcome).toBe('ended');
    original.destinationAlarms[0].alertEvents[0].occurredAt = now + 6000;
    expect(getCurrentAlarmAlerts(original, now)).toEqual([]);
  });

  it('clears screen history and presentation state on explicit end or rearm', () => {
    const presented = applyAlarmAlertAction(withEvents(), ref(), 'present', now).state;
    const ended = applyAlarmAlertAction(presented, ref(), 'end', now).state.destinationAlarms[0];
    expect(ended).toMatchObject({ enabled: false, watchState: 'off', alertEvents: [], presentedEventIds: [], pendingEvents: [] });
    expect(armDestinationAlarm(presented.destinationAlarms[0], 'new-session', now)).toMatchObject({ alertEvents: [], presentedEventIds: [] });
    expect(disarmDestinationAlarm(presented.destinationAlarms[0])).toMatchObject({ alertEvents: [], presentedEventIds: [] });
  });
});

describe('alarm-screen storage migration', () => {
  it('migrates only genuinely pending legacy events and never invents delivered history', () => {
    const legacy = withEvents(['arrived']);
    const { alertEvents: _events, presentedEventIds: _presented, ...alarm } = legacy.destinationAlarms[0];
    const migrated = normalizeAppState({ ...legacy, schemaVersion: 6, destinationAlarms: [alarm] });
    expect(migrated.schemaVersion).toBe(7);
    expect(migrated.destinationAlarms[0].alertEvents).toEqual(alarm.pendingEvents);
    expect(migrated.destinationAlarms[0].presentedEventIds).toEqual([]);
    expect(normalizeDestinationAlarm({ ...alarm, pendingEvents: [] })!.alertEvents).toEqual([]);
    expect(normalizeDestinationAlarm({ ...alarm, alertEvents: [] })!.alertEvents).toEqual([]);
  });

  it('rejects foreign, malformed, duplicate and future screen events and bounds history', () => {
    const original = withEvents();
    const alarm = original.destinationAlarms[0];
    const event = alarm.alertEvents[0];
    const candidates = [event, event, { ...event, id: 'foreign', alarmId: 'another' },
      { ...event, id: 'other-session', sessionId: 'another' }, { ...event, id: 'malformed', stage: 'unknown' },
      { ...event, id: 'future', occurredAt: Date.now() + 60_000 }];
    const restored = normalizeDestinationAlarm({ ...alarm, alertEvents: candidates, presentedEventIds: [event.id, event.id, 'foreign'] })!;
    expect(restored.alertEvents).toEqual([event]);
    expect(restored.presentedEventIds).toEqual([event.id]);
    const many = Array.from({ length: 12 }, (_, index) => ({ ...event, id: `event-${index}`, occurredAt: index + 1 }));
    expect(normalizeDestinationAlarm({ ...alarm, alertEvents: many })!.alertEvents).toHaveLength(8);
  });
});
