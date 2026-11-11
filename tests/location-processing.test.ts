import { describe, expect, it, vi } from 'vitest';
import { armDestinationAlarm, createDestinationAlarm } from '../src/domain/destination-alarm';
import { processLocationBatch } from '../src/domain/location-processing';
import type { LocationFix, SavedDestination, TransitRoute, Trip } from '../src/domain/models';
import { defaultAppState, type StoredAppState } from '../src/services/storage';

vi.mock('expo-sqlite', () => ({}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

const now = 100_000;
const destination: SavedDestination = {
  id: 'recto', name: 'Recto Station', latitude: 14.6, longitude: 121, kind: 'rail-station', source: 'map-pin',
  createdAt: '2026-11-11T00:00:00.000Z', updatedAt: '2026-11-11T00:00:00.000Z',
};
function fix(distanceM: number, timestamp: number, accuracyM: number | null = 10): LocationFix {
  return { latitude: destination.latitude + distanceM / 111_195, longitude: destination.longitude, timestamp, accuracyM };
}
function savedState(overrides: Partial<StoredAppState> = {}): StoredAppState {
  return {
    ...defaultAppState, destinations: [destination],
    destinationAlarms: [armDestinationAlarm(createDestinationAlarm('alarm', destination.id), 'session', 90_000)],
    ...overrides,
  };
}

describe('shared location batch processing', () => {
  it('observes an exit and two nearby readings during a complete short pass-through batch', () => {
    const current = savedState();
    const outcome = processLocationBatch(current, [fix(850, 100_000), fix(350, 99_000), fix(800, 97_000), fix(400, 98_000)], now);
    const alarm = outcome.state.destinationAlarms[0];
    expect(outcome.acceptedFixes).toBe(4);
    expect(alarm.watchState).toBe('alerted');
    expect(alarm.pendingEvent?.id).toBe('session:99000');
    expect(alarm.lastDistanceM).toBeCloseTo(350, 0);
    expect(outcome.state.lastLocationAt).toBe(now);
    expect(current.destinationAlarms[0].watchState).toBe('awaiting-exit');
  });

  it('retains last good coordinates when a later poor reading arrives and recovers on the next good one', () => {
    const good = processLocationBatch(savedState(), [fix(2_000, 98_000)], now).state;
    const bad = processLocationBatch(good, [fix(0, 99_000, -1)], now);
    expect(bad.acceptedFixes).toBe(0);
    expect(bad.state.lastLocation).toBe(good.lastLocation);
    expect(bad.state.lastLocationAt).toBe(98_000);
    expect(bad.state.destinationAlarms[0]).toBe(good.destinationAlarms[0]);
    expect(bad.state.locationProblem).toContain('GPS is weak');
    const recovered = processLocationBatch(bad.state, [fix(1_500, now)], now);
    expect(recovered.state.lastLocationAt).toBe(now);
    expect(recovered.state.locationProblem).toBeNull();
  });

  it('does not let a future timestamp poison later accepted readings', () => {
    const rejected = processLocationBatch(savedState(), [fix(1_000, now + 100_000)], now);
    expect(rejected.state.lastLocationAt).toBeNull();
    const recovered = processLocationBatch(rejected.state, [fix(2_000, now)], now);
    expect(recovered.acceptedFixes).toBe(1);
    expect(recovered.state.lastLocationAt).toBe(now);
  });

  it('skips duplicate/older samples without rewriting state or counting confirmations twice', () => {
    const current = processLocationBatch(savedState(), [fix(2_000, now)], now).state;
    const outcome = processLocationBatch(current, [fix(0, now), fix(0, now - 1)], now);
    expect(outcome.state).toBe(current);
    expect(outcome.acceptedFixes).toBe(0);
    expect(outcome.tripEvents).toEqual([]);
  });

  it('preserves independent durable alerts for every enabled alarm in a batch', () => {
    const current = savedState();
    current.destinationAlarms.push(armDestinationAlarm(createDestinationAlarm('second', destination.id), 'second-session', 90_000));
    const outcome = processLocationBatch(current, [fix(800, 97_000), fix(400, 98_000), fix(350, 99_000)], now);
    expect(outcome.state.destinationAlarms.map((alarm) => alarm.pendingEvent?.id)).toEqual(['session:99000', 'second-session:99000']);
  });

  it('does no location work when every alarm and trip is inactive', () => {
    const current = savedState({ destinationAlarms: [] });
    expect(processLocationBatch(current, [fix(1_000, now)], now).state).toBe(current);
  });

  it('disarms alarms whose destination was removed', () => {
    const current = savedState({ destinations: [] });
    const outcome = processLocationBatch(current, [fix(800, now)], now);
    expect(outcome.state.destinationAlarms[0]).toMatchObject({ enabled: false, watchState: 'off', sessionId: null, lastDistanceM: null });
  });

  it('evaluates route progress from all readings without using pre-trip samples', () => {
    const route: TransitRoute = {
      id: 'bus', name: 'My bus route', mode: 'bus', direction: 'north', dataQuality: 'user-authored', coordinateStatus: 'complete', sourceLabel: 'Rider-saved',
      stops: [{ id: 'start', name: 'Start', latitude: 14.59, longitude: 121 }, { id: 'end', name: 'Destination', latitude: 14.6, longitude: 121 }],
    };
    const trip: Trip = {
      id: 'trip', routeId: 'bus', boardingIndex: 0, destinationIndex: 1, lastConfirmedIndex: 0, alertMode: 'destination-only', startedAt: new Date(99_000).toISOString(), status: 'active',
      approachedStopIds: [], arrivedStopIds: [], movingAwayCount: 0, directionAdvisorySent: false, offRouteCount: 0, routeDeviationSent: false,
    };
    const current = savedState({ activeTrip: trip, activeRoute: route });
    const preTrip = processLocationBatch(current, [fix(0, 98_000)], now);
    expect(preTrip.state.activeTrip).toBe(trip);
    const arrived = processLocationBatch(preTrip.state, [fix(0, 99_000)], now);
    expect(arrived.state.activeTrip?.status).toBe('completed');
    expect(arrived.tripEvents.map((event) => event.type)).toContain('destination-arrived');
  });
});
