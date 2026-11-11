import { describe, expect, it } from 'vitest';
import { formatAlarmDistance, getAlarmDistancePresentation, LIVE_DISTANCE_FRESH_MS, type AlarmDistanceReading } from '../src/domain/alarm-distance-presentation';
import { armDestinationAlarm, createDestinationAlarm } from '../src/domain/destination-alarm';
import type { DestinationAlarm, SavedDestination } from '../src/domain/models';

const now = 1_000_000;
const destination: SavedDestination = {
  id: 'recto', name: 'Recto Station', kind: 'rail-station', source: 'map-pin',
  latitude: 14.6, longitude: 121, createdAt: '2026-11-11', updatedAt: '2026-11-11',
};
const emptyReading: AlarmDistanceReading = { location: null, locationAt: null, accuracyM: null, problem: null, trackingProblem: null };
const alarm: DestinationAlarm = {
  ...armDestinationAlarm(createDestinationAlarm('alarm', destination.id), 'session', now - 60_000),
  watchState: 'monitoring',
};
const reading: AlarmDistanceReading = { ...emptyReading, location: { latitude: 14.6 + 2400 / 111195, longitude: 121 }, locationAt: now - 8000, accuracyM: 15 };

describe('active alarm distance presentation', () => {
  it('shows a fresh straight-line distance and its actual update age', () => {
    const result = getAlarmDistancePresentation(destination, alarm, reading, now);
    expect(result.distanceLabel).toBe('About 2.4 km away');
    expect(result.updatedLabel).toBe('Updated 8 s ago');
    expect(result.status).toBe('monitoring');
    expect(result.isLastKnown).toBe(false);
  });

  it('never invents zero metres before a usable reading exists', () => {
    const result = getAlarmDistancePresentation(destination, alarm, emptyReading, now);
    expect(result.distanceLabel).toBeNull();
    expect(result.updatedLabel).toBeNull();
    expect(result.status).toBe('locating');
  });

  it('does not reuse a location from before the alarm was enabled', () => {
    const current = { ...alarm, armedAt: now - 1000, lastFixAt: now - 2000, lastDistanceM: 0 };
    const result = getAlarmDistancePresentation(destination, current, reading, now);
    expect(result.distanceLabel).toBeNull();
    expect(result.status).toBe('locating');
  });

  it('marks an old value as last known instead of presenting it as live', () => {
    const result = getAlarmDistancePresentation(destination, { ...alarm, armedAt: now - 120_000 }, {
      ...reading, locationAt: now - LIVE_DISTANCE_FRESH_MS - 1,
    }, now);
    expect(result.status).toBe('delayed');
    expect(result.distanceLabel).toBe('Last known: About 2.4 km away');
    expect(result.isLastKnown).toBe(true);
  });

  it('retains the last accepted distance while a poor reading needs attention', () => {
    const result = getAlarmDistancePresentation(destination, { ...alarm, lastFixAt: now - 12_000, lastDistanceM: 725 }, {
      ...reading, accuracyM: 250, problem: 'Waiting for a more accurate GPS fix.',
    }, now);
    expect(result.status).toBe('weak-gps');
    expect(result.distanceLabel).toBe('Last known: About 725 m away');
    expect(result.updatedLabel).toBe('Updated 12 s ago');
  });

  it.each([
    { label: 'negative accuracy', patch: { accuracyM: -1 } },
    { label: 'unknown accuracy', patch: { accuracyM: null } },
    { label: 'invalid coordinates', patch: { location: { latitude: Number.NaN, longitude: 121 } } },
    { label: 'out of range coordinates', patch: { location: { latitude: 91, longitude: 121 } } },
    { label: 'future timestamp', patch: { locationAt: now + 60_000 } },
  ])('rejects $label without replacing the last accepted value', ({ patch }) => {
    const result = getAlarmDistancePresentation(destination, { ...alarm, lastFixAt: now - 12_000, lastDistanceM: 725 }, { ...reading, ...patch }, now);
    expect(result.distanceLabel).toBe('About 725 m away');
    expect(result.updatedLabel).toBe('Updated 12 s ago');
  });

  it('does not replace a newer alarm reading with an older live-store snapshot', () => {
    const result = getAlarmDistancePresentation(destination, { ...alarm, lastFixAt: now - 1000, lastDistanceM: 525 }, reading, now);
    expect(result.distanceLabel).toBe('About 525 m away');
  });

  it('shows unavailable monitoring as last known even with a recently accepted reading', () => {
    const result = getAlarmDistancePresentation(destination, alarm, { ...reading, trackingProblem: 'Background location is off.' }, now);
    expect(result.status).toBe('unavailable');
    expect(result.detail).toBe('Background location is off.');
    expect(result.distanceLabel).toBe('Last known: About 2.4 km away');
  });

  it.each([
    { problem: 'Location updates are delayed. Waiting for a fresh GPS reading.', status: 'delayed' },
    { problem: 'Location is unavailable. Waiting for a usable GPS reading.', status: 'unavailable' },
    { problem: 'Location time is unreliable. Waiting for a fresh GPS reading.', status: 'delayed' },
  ])('does not mislabel a timing or availability problem as weak GPS: $problem', ({ problem, status }) => {
    const result = getAlarmDistancePresentation(destination, alarm, { ...reading, problem }, now);
    expect(result.status).toBe(status);
    expect(result.distanceLabel).toBe('Last known: About 2.4 km away');
  });

  it('distinguishes waiting to leave from active arrival monitoring', () => {
    const result = getAlarmDistancePresentation(destination, { ...alarm, watchState: 'awaiting-exit' }, reading, now);
    expect(result.status).toBe('waiting-to-leave');
    expect(result.distanceLabel).toBe('About 2.4 km away');
  });

  it('freezes the alerted distance instead of continuing to imply live monitoring', () => {
    const result = getAlarmDistancePresentation(destination, {
      ...alarm, enabled: false, watchState: 'alerted', lastFixAt: now - 12_000, lastDistanceM: 400,
    }, reading, now);
    expect(result.statusLabel).toBe('Alert sent');
    expect(result.distanceLabel).toBe('Last known: About 400 m away');
    expect(result.updatedLabel).toBe('Updated 12 s ago');
  });

  it('does not claim an alert was sent before pending notification delivery is acknowledged', () => {
    const result = getAlarmDistancePresentation(destination, {
      ...alarm, enabled: false, watchState: 'alerted', lastFixAt: now - 1000, lastDistanceM: 400,
      pendingEvent: { id: 'event', alarmId: alarm.id, destinationId: destination.id, sessionId: 'session', message: 'Near Recto' },
    }, reading, now);
    expect(result.statusLabel).toBe('Alert pending');
    expect(result.tone).toBe('warning');
  });

  it('does not render a distance for an invalid saved destination', () => {
    const result = getAlarmDistancePresentation({ ...destination, longitude: 181 }, { ...alarm, lastFixAt: now - 1000, lastDistanceM: 400 }, reading, now);
    expect(result.status).toBe('unavailable');
    expect(result.distanceLabel).toBeNull();
  });

  it('rounds meters without claiming exact zero or excess precision', () => {
    expect(formatAlarmDistance(0)).toBe('About 25 m away');
    expect(formatAlarmDistance(623)).toBe('About 625 m away');
    expect(formatAlarmDistance(2402)).toBe('About 2.4 km away');
  });
});
