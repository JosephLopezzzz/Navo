import { describe, expect, it, vi } from 'vitest';
import { armDestinationAlarm, createDestinationAlarm } from '../src/domain/destination-alarm';
import { getLocationSamplingPolicy } from '../src/domain/location-sampling';
import type { SavedDestination, TransitRoute, Trip } from '../src/domain/models';
import { defaultAppState, type StoredAppState } from '../src/services/storage';

vi.mock('expo-sqlite', () => ({}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

const now = 100_000;
const destination: SavedDestination = {
  id: 'stop', name: 'My destination', latitude: 14.6, longitude: 121, kind: 'place', source: 'map-pin', createdAt: '', updatedAt: '',
};
function stateAt(distanceM: number, overrides: Partial<StoredAppState> = {}): StoredAppState {
  return {
    ...defaultAppState, destinations: [destination],
    destinationAlarms: [armDestinationAlarm(createDestinationAlarm('alarm', destination.id), 'session', 90_000)],
    lastLocation: { latitude: destination.latitude + distanceM / 111_195, longitude: destination.longitude },
    lastLocationAt: now, lastLocationAccuracyM: 10,
    ...overrides,
  };
}

describe('adaptive location sampling policy', () => {
  it('uses lower-power distance and time requests when safely far away', () => {
    const policy = getLocationSamplingPolicy(stateAt(8_000), now);
    expect(policy).toMatchObject({ profile: 'far', accuracy: 'balanced', timeInterval: 20_000, distanceInterval: 75 });
    expect(getLocationSamplingPolicy(stateAt(8_000, { settings: { ...defaultAppState.settings, updateIntervalMs: 30_000, updateDistanceM: 150 } }), now))
      .toMatchObject({ profile: 'far', timeInterval: 30_000, distanceInterval: 150 });
  });

  it('tightens requests relative to the alarm boundary rather than the destination alone', () => {
    expect(getLocationSamplingPolicy(stateAt(2_500), now)).toMatchObject({ profile: 'approaching', accuracy: 'high', timeInterval: 5_000 });
    expect(getLocationSamplingPolicy(stateAt(1_200), now)).toMatchObject({ profile: 'near', accuracy: 'high', timeInterval: 2_000, pausesUpdatesAutomatically: false });
    const wideRadius = stateAt(5_000);
    wideRadius.destinationAlarms[0].radiusM = 4_000;
    expect(getLocationSamplingPolicy(wideRadius, now).profile).toBe('near');
  });

  it('recovers promptly from unknown, poor, stale, or pre-session shared GPS', () => {
    for (const overrides of [
      { lastLocation: null }, { lastLocationAccuracyM: 120 }, { lastLocationAt: now - 60_001 },
    ]) {
      expect(getLocationSamplingPolicy(stateAt(8_000, overrides), now)).toMatchObject({ profile: 'recovery', accuracy: 'high', pausesUpdatesAutomatically: false });
    }
    const justEnabled = stateAt(8_000);
    justEnabled.destinationAlarms[0].armedAt = now + 1;
    expect(getLocationSamplingPolicy(justEnabled, now).profile).toBe('recovery');
  });

  it('takes the most demanding enabled alarm and ignores disabled alarms', () => {
    const current = stateAt(8_000);
    const nearby = { ...destination, id: 'nearby', latitude: current.lastLocation!.latitude };
    current.destinations.push(nearby);
    current.destinationAlarms.push({ ...armDestinationAlarm(createDestinationAlarm('nearby-alarm', nearby.id), 'second', 90_000), watchState: 'monitoring' });
    expect(getLocationSamplingPolicy(current, now).profile).toBe('near');
    current.destinationAlarms[1].enabled = false;
    expect(getLocationSamplingPolicy(current, now).profile).toBe('far');
  });

  it('keeps a nearby route stop responsive even when every alarm is far away', () => {
    const current = stateAt(8_000);
    const route: TransitRoute = {
      id: 'bus', name: 'Bus', mode: 'bus', direction: 'north', dataQuality: 'user-authored', coordinateStatus: 'complete', sourceLabel: 'Rider-saved',
      stops: [{ id: 'start', name: 'Start' }, { id: 'end', name: 'Next stop', ...current.lastLocation! }],
    };
    const trip: Trip = {
      id: 'trip', routeId: 'bus', boardingIndex: 0, destinationIndex: 1, lastConfirmedIndex: 0, alertMode: 'destination-only', startedAt: new Date(90_000).toISOString(), status: 'active',
      approachedStopIds: [], arrivedStopIds: [], movingAwayCount: 0, directionAdvisorySent: false, offRouteCount: 0, routeDeviationSent: false,
    };
    current.activeTrip = trip;
    current.activeRoute = route;
    expect(getLocationSamplingPolicy(current, now).profile).toBe('near');
  });

  it('escalates earlier with speed or aging GPS and never trusts a stationary sample to slow down', () => {
    const current = stateAt(6_000);
    expect(getLocationSamplingPolicy(current, now, 0)).toEqual(getLocationSamplingPolicy(current, now));
    expect(getLocationSamplingPolicy(current, now, 200).profile).toBe('approaching');
    expect(getLocationSamplingPolicy(current, now, 400).profile).toBe('near');
    expect(getLocationSamplingPolicy(stateAt(3_600, { lastLocationAt: now - 10_000 }), now).profile).toBe('approaching');
  });

  it('waits for departure at lower power only while confidently inside the current alert area', () => {
    expect(getLocationSamplingPolicy(stateAt(100), now)).toMatchObject({ profile: 'departure', accuracy: 'balanced', timeInterval: 10_000, distanceInterval: 25, pausesUpdatesAutomatically: true });
    expect(getLocationSamplingPolicy(stateAt(480, { lastLocationAccuracyM: 30 }), now).profile).toBe('near');
    const aging = stateAt(100, { lastLocationAt: now - 10_000 });
    aging.destinationAlarms[0].armedAt = now - 60_000;
    expect(getLocationSamplingPolicy(aging, now).profile).toBe('departure');
    aging.lastLocationAt = now - 15_000;
    expect(getLocationSamplingPolicy(aging, now).profile).toBe('near');
  });

  it('lets a monitoring alarm override departure waiting and does not relax an already monitoring alarm inside the area', () => {
    const current = stateAt(100);
    const monitoring = { ...current.destinationAlarms[0], id: 'monitoring', watchState: 'monitoring' as const };
    current.destinationAlarms.push(monitoring);
    expect(getLocationSamplingPolicy(current, now)).toMatchObject({ profile: 'near', accuracy: 'high', timeInterval: 2_000 });
  });

  it('temporarily removes the distance filter while waiting for a second recent inside confirmation', () => {
    const current = stateAt(100);
    current.destinationAlarms[0] = { ...current.destinationAlarms[0], watchState: 'monitoring', consecutiveInsideFixes: 1, lastFixAt: now };
    expect(getLocationSamplingPolicy(current, now)).toMatchObject({ profile: 'near', timeInterval: 2_000, distanceInterval: 0 });
    current.destinationAlarms[0].consecutiveInsideFixes = 0;
    expect(getLocationSamplingPolicy(current, now).distanceInterval).toBe(10);
  });

  it('ends the stationary confirmation burst when its first reading is more than 30 seconds old', () => {
    const current = stateAt(100);
    current.destinationAlarms[0] = { ...current.destinationAlarms[0], armedAt: now - 60_000, watchState: 'monitoring', consecutiveInsideFixes: 1, lastFixAt: now - 30_000 };
    expect(getLocationSamplingPolicy(current, now).distanceInterval).toBe(0);
    current.destinationAlarms[0].lastFixAt = now - 30_001;
    expect(getLocationSamplingPolicy(current, now).distanceInterval).toBe(10);
  });
});
