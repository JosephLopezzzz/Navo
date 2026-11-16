import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  armDestinationAlarm,
  createDestinationAlarm,
  disarmDestinationAlarm,
  distanceBetweenCoordinatesM,
  evaluateDestinationAlarmFix,
  MAX_POST_ARRIVAL_MONITORING_MS,
  normalizeDestinationAlarm,
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
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(3_000); });
  afterEach(() => vi.useRealTimers());
  it('keeps saved alarms off until the rider arms them', () => {
    const alarm = createDestinationAlarm('alarm-1', destination.id);
    expect(alarm.enabled).toBe(false);
    expect(evaluateDestinationAlarmFix(destination, alarm, fix(0, 1000)).ignoredReason).toBe('inactive');
  });

  it('waits for the rider to move away before checking for the next arrival', () => {
    const alarm = armDestinationAlarm(createDestinationAlarm('alarm-1', destination.id), 'journey-1', 0);
    const nearby = evaluateDestinationAlarmFix(destination, alarm, fix(50, 1000));
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
    expect(second.alarm.enabled).toBe(true);
    expect(second.alarm.watchState).toBe('monitoring');
    expect(second.event?.stage).toBe('approaching');
    expect(second.event?.thresholdM).toBe(500);
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

  it('does not count samples captured before this alarm session', () => {
    const alarm = armDestinationAlarm(createDestinationAlarm('alarm-1', destination.id), 'journey-1', 2_000);
    const result = evaluateDestinationAlarmFix(destination, alarm, fix(800, 1_000));
    expect(result.ignoredReason).toBe('pre-session');
    expect(result.alarm).toBe(alarm);
  });

  it('requires nearby confirmations within the same short approach', () => {
    const alarm = { ...armDestinationAlarm(createDestinationAlarm('alarm-1', destination.id), 'journey-1', 0), watchState: 'monitoring' as const };
    const first = evaluateDestinationAlarmFix(destination, alarm, fix(300, 40_000), 40_000);
    const muchLater = evaluateDestinationAlarmFix(destination, first.alarm, fix(300, 80_000), 80_000);
    const confirming = evaluateDestinationAlarmFix(destination, muchLater.alarm, fix(300, 82_000), 82_000);
    expect(muchLater.event).toBeNull();
    expect(muchLater.alarm.consecutiveInsideFixes).toBe(1);
    expect(confirming.event).not.toBeNull();
  });

  it('keeps antipodal distance finite despite floating-point rounding', () => {
    expect(distanceBetweenCoordinatesM({ latitude: 37.7749, longitude: -122.4194 }, { latitude: -37.7749, longitude: 57.5806 })).toBeCloseTo(Math.PI * 6_371_008.8, 0);
  });

  it('recovers from a previously stored future fix without counting its arrival confirmation', () => {
    const alarm = {
      ...armDestinationAlarm(createDestinationAlarm('alarm-1', destination.id), 'journey-1', 0),
      watchState: 'monitoring' as const,
      lastFixAt: 90_000,
      consecutiveInsideFixes: 1,
    };
    const first = evaluateDestinationAlarmFix(destination, alarm, fix(300, 2_000), 2_000);
    expect(first.ignoredReason).toBeUndefined();
    expect(first.event).toBeNull();
    expect(first.alarm.consecutiveInsideFixes).toBe(1);
    expect(first.alarm.lastFixAt).toBe(2_000);
    expect(evaluateDestinationAlarmFix(destination, first.alarm, fix(300, 3_000), 3_000).event).not.toBeNull();
  });
});

function monitoring(overrides: Partial<ReturnType<typeof createDestinationAlarm>> = {}) {
  return { ...armDestinationAlarm({ ...createDestinationAlarm('alarm-1', destination.id), ...overrides }, 'journey-1', 0), watchState: 'monitoring' as const };
}
function sequence(alarm: ReturnType<typeof createDestinationAlarm>, samples: [number, number, number?][]) {
  const events = [];
  for (const [distance, timestamp, accuracy] of samples) {
    const result = evaluateDestinationAlarmFix(destination, alarm, fix(distance, timestamp, accuracy ?? 10), timestamp);
    alarm = result.alarm;
    if (result.event) events.push(result.event);
  }
  return { alarm, events };
}

describe('staged destination alerts', () => {
  it('does not silence a short ride that begins inside a selected wide approach distance', () => {
    const alarm = armDestinationAlarm({ ...createDestinationAlarm('alarm-1', destination.id), alertDistancesM: [2000, 500] }, 'journey-1', 0);
    const result = sequence(alarm, [[1500, 1000], [1400, 3000], [1300, 5000], [400, 7000], [350, 9000], [50, 11000], [40, 13000]]);
    expect(result.events.map((event) => [event.stage, event.thresholdM])).toEqual([['approaching', 2000], ['approaching', 500], ['arrived', undefined]]);
  });
  it('delivers selected distances, arrival and a possible missed stop only once per journey', () => {
    const result = sequence(monitoring({ alertDistancesM: [1000, 500] }), [
      [900, 1_000], [850, 2_000], [450, 3_000], [400, 4_000],
      [70, 5_000], [60, 6_000], [200, 11_000], [300, 16_000], [400, 21_000], [500, 26_000],
    ]);
    expect(result.events.map((event) => [event.stage, event.thresholdM])).toEqual([
      ['approaching', 1000], ['approaching', 500], ['arrived', undefined], ['missed', undefined],
    ]);
    expect(result.events.map((event) => event.id)).toEqual([
      'journey-1:approaching:1000', 'journey-1:approaching:500', 'journey-1:arrived', 'journey-1:missed',
    ]);
    expect(result.alarm.enabled).toBe(false);
    expect(result.alarm.pendingEvents.map((event) => event.stage)).toEqual(['missed']);
    expect(result.events.at(-1)?.message).toContain('may have passed');
    expect(armDestinationAlarm(result.alarm, 'next', 30_000).progress.notifiedDistancesM).toEqual([]);
  });

  it('coalesces skipped outer thresholds and durable obsolete notifications rather than ringing a burst', () => {
    const result = sequence(monitoring({ alertDistancesM: [1000, 500, 200] }), [[150, 1000], [140, 2000], [120, 3000], [80, 4000], [70, 5000]]);
    expect(result.events.map((event) => [event.stage, event.thresholdM])).toEqual([['approaching', 200], ['arrived', undefined]]);
    expect(result.alarm.progress.notifiedDistancesM).toEqual([1000, 500, 200]);
    expect(result.alarm.pendingEvents.map((event) => event.stage)).toEqual(['arrived']);
  });

  it('requires the full accuracy circle to be in the arrival area', () => {
    const result = sequence(monitoring({ alertDistancesM: [] }), [[90, 1000, 40], [85, 2000, 40], [50, 3000, 40], [45, 4000, 40]]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].stage).toBe('arrived');
    expect(result.events[0].occurredAt).toBe(4000);
  });

  it('finishes after the final enabled approach stage or arrival without requiring a missed-stage alert', () => {
    const onlyDistance = sequence(monitoring({ alertDistancesM: [500], notifyOnArrival: false, notifyOnMissed: false }), [[400, 1000], [350, 2000]]);
    expect(onlyDistance.events[0].stage).toBe('approaching');
    expect(onlyDistance.alarm.enabled).toBe(false);
    const onlyArrival = sequence(monitoring({ alertDistancesM: [], notifyOnMissed: false }), [[50, 1000], [40, 2000]]);
    expect(onlyArrival.events[0].stage).toBe('arrived');
    expect(onlyArrival.alarm.enabled).toBe(false);
  });

  it('can detect a close pass without enabling approaching or arrival notifications', () => {
    const result = sequence(monitoring({ alertDistancesM: [], notifyOnArrival: false }), [[150, 1000], [140, 2000], [250, 7000], [350, 12000], [450, 17000]]);
    expect(result.events.map((event) => event.stage)).toEqual(['missed']);
    expect(result.alarm.enabled).toBe(false);
  });

  it('never treats merely approaching from far away then turning away as a missed stop', () => {
    const result = sequence(monitoring(), [[400, 1000], [350, 2000], [500, 7000], [650, 12000], [800, 17000]]);
    expect(result.events.some((event) => event.stage === 'missed')).toBe(false);
  });

  it('detects passing a stop with realistic two-second bus updates and GPS uncertainty', () => {
    const result = sequence(monitoring({ alertDistancesM: [] }), [[60, 1000, 20], [50, 3000, 20],
      ...Array.from({ length: 30 }, (_, index): [number, number, number] => [60 + index * 10, 5000 + index * 2000, 20]),
    ]);
    expect(result.events.map((event) => event.stage)).toEqual(['arrived', 'missed']);
    expect(result.alarm.enabled).toBe(false);
  });

  it('does not warn of a missed stop when someone gets off and walks away slowly', () => {
    const result = sequence(monitoring({ alertDistancesM: [] }), [[50, 1000], [40, 2000],
      ...Array.from({ length: 12 }, (_, index): [number, number] => [80 + index * 40, 22_000 + index * 20_000]),
    ]);
    expect(result.events.map((event) => event.stage)).toEqual(['arrived']);
  });

  it('does not infer a missed stop from isolated GPS drift or a long loss of fixes', () => {
    const drift = sequence(monitoring({ alertDistancesM: [] }), [[80, 1000], [70, 2000], [250, 7000, 80], [150, 12000, 80], [400, 17000, 80]]);
    expect(drift.events.some((event) => event.stage === 'missed')).toBe(false);
    const gap = sequence(monitoring({ alertDistancesM: [] }), [[80, 1000], [70, 2000], [300, 40_000], [450, 45_000], [600, 50_000], [750, 55_000]]);
    expect(gap.events.map((event) => event.stage)).toEqual(['arrived']);
    expect(gap.alarm.progress.closeConfirmedAt).toBeNull();
  });

  it('does not create an immediate missed alert from a single far-away jump after arriving', () => {
    const result = sequence(monitoring({ alertDistancesM: [] }), [[50, 1000], [40, 2000], [1000, 7000], [1005, 12000], [1002, 17000]]);
    expect(result.events.map((event) => event.stage)).toEqual(['arrived']);
  });

  it('does not let one GPS jump followed by slow drift impersonate sustained travel', () => {
    const result = sequence(monitoring({ alertDistancesM: [] }), [[50, 1000], [40, 2000], [1000, 7000], [1005, 12000], [1010, 17000], [1015, 22000]]);
    expect(result.events.map((event) => event.stage)).toEqual(['arrived']);
  });

  it('ends monitoring after ten minutes of confirmed arrival instead of tracking indefinitely', () => {
    const arrived = sequence(monitoring({ alertDistancesM: [] }), [[50, 1000], [40, 2000]]);
    const result = sequence(arrived.alarm, [[30, 2000 + MAX_POST_ARRIVAL_MONITORING_MS]]);
    expect(result.events).toEqual([]);
    expect(result.alarm.enabled).toBe(false);
    expect(result.alarm.pendingEvents.map((event) => event.stage)).toEqual(['arrived']);
  });

  it('retains stage progress and event IDs after persistence/restart without replaying a distance', () => {
    const approached = sequence(monitoring(), [[400, 1000], [350, 2000]]);
    const restored = normalizeDestinationAlarm(JSON.parse(JSON.stringify(approached.alarm)))!;
    const continued = sequence(restored, [[300, 3000], [250, 4000], [50, 5000], [40, 6000]]);
    expect(continued.events.map((event) => event.stage)).toEqual(['arrived']);
    expect(continued.alarm.pendingEvents[0].id).toBe('journey-1:arrived');
  });

  it('fails closed when no alert stages are selected and clears all queued events when stopped', () => {
    expect(armDestinationAlarm({ ...createDestinationAlarm('alarm', destination.id), alertDistancesM: [], notifyOnArrival: false, notifyOnMissed: false }, 'session').enabled).toBe(false);
    const arrived = sequence(monitoring(), [[50, 1000], [40, 2000]]);
    expect(disarmDestinationAlarm(arrived.alarm).pendingEvents).toEqual([]);
    expect(disarmDestinationAlarm(arrived.alarm).progress.arrivalConfirmedAt).toBeNull();
  });
});
