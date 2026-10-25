import { describe, expect, it } from 'vitest';
import {
  armDestinationAlarm,
  createDestinationAlarm,
  disarmDestinationAlarm,
  distanceBetweenCoordinatesM,
  evaluateDestinationAlarmFix,
} from '../src/domain/destination-alarm';
import type { LocationFix, SavedDestination } from '../src/domain/models';

const destination: SavedDestination = {
  id: 'destination-home',
  name: 'Recto Station',
  latitude: 14.5995,
  longitude: 120.9842,
  kind: 'rail-station',
  source: 'tomtom',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
};

function fix(distanceM: number, timestamp: number, accuracyM: number | null = 10): LocationFix {
  return {
    latitude: destination.latitude + distanceM / 111_195,
    longitude: destination.longitude,
    accuracyM,
    timestamp,
  };
}

describe('destination alarm evaluator', () => {
  it('keeps saved alarms off until the rider arms them', () => {
    const alarm = createDestinationAlarm('alarm-1', destination.id);
    expect(alarm.enabled).toBe(false);
    expect(evaluateDestinationAlarmFix(destination, alarm, fix(0, 1000)).ignoredReason).toBe('inactive');
  });

  it('waits for the rider to move away before checking for the next arrival', () => {
    const alarm = armDestinationAlarm(createDestinationAlarm('alarm-1', destination.id), 'journey-1', 0);
    const nearby = evaluateDestinationAlarmFix(destination, alarm, fix(250, 1000));
    const outside = evaluateDestinationAlarmFix(destination, nearby.alarm, fix(750, 2000));

    expect(nearby.alarm.watchState).toBe('awaiting-exit');
    expect(nearby.event).toBeNull();
    expect(outside.alarm.watchState).toBe('monitoring');
    expect(outside.event).toBeNull();
  });

  it('alerts after two accurate fixes inside the saved destination radius', () => {
    const watching = {
      ...armDestinationAlarm(createDestinationAlarm('alarm-1', destination.id, 500), 'journey-1', 0),
      watchState: 'monitoring' as const,
    };
    const first = evaluateDestinationAlarmFix(destination, watching, fix(400, 1000));
    const second = evaluateDestinationAlarmFix(destination, first.alarm, fix(350, 2000));

    expect(first.event).toBeNull();
    expect(second.alarm.enabled).toBe(false);
    expect(second.alarm.watchState).toBe('alerted');
    expect(second.event?.sessionId).toBe('journey-1');
    expect(second.event?.message).toContain('Recto Station');
  });

  it('does not alert from poor, stale, or out-of-order GPS samples', () => {
    const watching = {
      ...armDestinationAlarm(createDestinationAlarm('alarm-1', destination.id), 'journey-1', 0),
      watchState: 'monitoring' as const,
    };
    const inaccurate = evaluateDestinationAlarmFix(destination, watching, fix(0, 1000, 81));
    const first = evaluateDestinationAlarmFix(destination, inaccurate.alarm, fix(0, 2000));
    const stale = evaluateDestinationAlarmFix(destination, first.alarm, fix(0, 1999));
    const second = evaluateDestinationAlarmFix(destination, stale.alarm, fix(0, 3000));

    expect(inaccurate.ignoredReason).toBe('poor-accuracy');
    expect(stale.ignoredReason).toBe('out-of-order');
    expect(second.event).not.toBeNull();
  });

  it('disarming clears the session so old fixes cannot wake the rider', () => {
    const armed = armDestinationAlarm(createDestinationAlarm('alarm-1', destination.id), 'journey-1', 0);
    const disarmed = disarmDestinationAlarm(armed);

    expect(disarmed.watchState).toBe('off');
    expect(disarmed.sessionId).toBeNull();
    expect(evaluateDestinationAlarmFix(destination, disarmed, fix(0, 1000)).event).toBeNull();
  });

  it('calculates real distance across latitude and longitude', () => {
    expect(distanceBetweenCoordinatesM(destination, destination)).toBe(0);
    expect(distanceBetweenCoordinatesM(destination, { latitude: destination.latitude, longitude: destination.longitude + 0.01 })).toBeGreaterThan(1000);
  });
});
