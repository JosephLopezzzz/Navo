import { describe, expect, it, vi } from 'vitest';
import { createDestinationAlarm, normalizeAlertDistancesM, normalizeDestinationAlarm, armDestinationAlarm } from '../src/domain/destination-alarm';
import { normalizeAppState } from '../src/services/storage';

vi.mock('expo-sqlite', () => ({}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

describe('staged alarm persistence migration', () => {
  it('migrates schema5 radii, sound selection and pending notifications without reenabling a completed alarm', () => {
    const destination = { id: 'destination', name: 'Saved stop', latitude: 14.6, longitude: 121, kind: 'place', source: 'map-pin', createdAt: '', updatedAt: '' };
    const state = normalizeAppState({
      schemaVersion: 5, destinations: [destination], destinationAlarms: [{
        id: 'alarm', destinationId: 'destination', radiusM: 350, ringtoneId: 'soft-bell', enabled: false,
        watchState: 'alerted', sessionId: 'session', armedAt: 0, lastFixAt: 2000, lastDistanceM: 300,
        firedAt: 2000, notificationIdentifier: null,
        pendingEvent: { id: 'session:2000', alarmId: 'alarm', destinationId: 'destination', sessionId: 'session', message: 'You are near Saved stop.' },
      }],
    });
    expect(state.schemaVersion).toBe(7);
    expect(state.destinations[0]).toEqual(destination);
    expect(state.destinationAlarms[0]).toMatchObject({ alertDistancesM: [350], radiusM: 350, enabled: false, watchState: 'alerted', ringtoneId: 'soft-bell', vibrationEnabled: true });
    expect(state.destinationAlarms[0].pendingEvents).toEqual([{
      id: 'session:2000', alarmId: 'alarm', destinationId: 'destination', sessionId: 'session',
      stage: 'approaching', occurredAt: 2000, distanceM: 300, thresholdM: 350, message: 'You are near Saved stop.',
    }]);
    expect(state.destinationAlarms[0]).not.toHaveProperty('pendingEvent');
  });

  it('preserves explicit empty distance selection, disabled stages and vibration preference', () => {
    const original = { ...createDestinationAlarm('alarm', 'destination'), alertDistancesM: [], notifyOnArrival: true, notifyOnMissed: false, vibrationEnabled: false };
    const restored = normalizeDestinationAlarm(original)!;
    expect(restored).toMatchObject({ alertDistancesM: [], radiusM: 100, notifyOnArrival: true, notifyOnMissed: false, vibrationEnabled: false, enabled: false });
  });

  it('filters unsafe distances and malformed alarms without silently creating or enabling alarms', () => {
    expect(normalizeAlertDistancesM([1000, 200, 1000, 100, -1, Infinity, '500', null, 20_000])).toEqual([1000, 200]);
    expect(normalizeAlertDistancesM([])).toEqual([]);
    expect(normalizeAlertDistancesM(undefined, 350)).toEqual([350]);
    const state = normalizeAppState({ destinationAlarms: [null, 8, {}, { id: 'alarm', destinationId: 'destination', enabled: true, watchState: 'monitoring' }] });
    expect(state.destinationAlarms).toHaveLength(1);
    expect(state.destinationAlarms[0].enabled).toBe(false);
    expect(state.destinationAlarms[0].watchState).toBe('off');
  });

  it('rejects foreign, malformed and duplicate pending events while preserving valid queue IDs', () => {
    const alarm = armDestinationAlarm(createDestinationAlarm('alarm', 'destination'), 'session', 0);
    const event = { id: 'session:arrived', alarmId: 'alarm', destinationId: 'destination', sessionId: 'session', stage: 'arrived', occurredAt: 1000, distanceM: 20, message: 'You are in the destination area.' };
    const restored = normalizeDestinationAlarm({ ...alarm, pendingEvents: [event, event, { ...event, id: 'foreign', sessionId: 'other' }, { ...event, id: 'invalid', occurredAt: -1 }, { ...event, id: 'invalid-stage', stage: 'something' }] })!;
    expect(restored.pendingEvents).toEqual([event]);
  });

  it('drops invalid GPS evidence rather than converting corrupted state into a missed-stop warning', () => {
    const alarm = armDestinationAlarm(createDestinationAlarm('alarm', 'destination'), 'session', 0);
    const restored = normalizeDestinationAlarm({ ...alarm, lastFixAt: 1000,
      progress: { ...alarm.progress, closeConfirmedAt: 5000, closestDistanceUpperM: -10, movingAwayStartedAt: 5000, movingAwayFixes: 999, arrivalConfirmedAt: 9000 },
    })!;
    expect(restored.progress).toMatchObject({ closeConfirmedAt: null, closestDistanceUpperM: null, movingAwayFixes: 0, movingAwayStartedAt: null, arrivalConfirmedAt: null });
  });

  it('fails closed for a persisted active alarm with all alert stages off', () => {
    const alarm = armDestinationAlarm(createDestinationAlarm('alarm', 'destination'), 'session', 0);
    const restored = normalizeDestinationAlarm({ ...alarm, alertDistancesM: [], notifyOnArrival: false, notifyOnMissed: false })!;
    expect(restored.enabled).toBe(false);
    expect(restored.sessionId).toBeNull();
    expect(restored.pendingEvents).toEqual([]);
  });
});
