import { describe, expect, it } from 'vitest';
import { evaluateLocationFix, manuallyConfirmNextStop } from '../src/domain/trip-engine';
import type { TransitRoute, Trip } from '../src/domain/models';

const route: TransitRoute = {
  id: 'demo', name: 'Demo rail line', mode: 'rail', direction: 'northbound',
  dataQuality: 'preview', coordinateStatus: 'complete', sourceLabel: 'Test fixture',
  stops: [
    { id: 'a', name: 'Boarding', latitude: 14.60, longitude: 120.98 },
    { id: 'b', name: 'Next stop', latitude: 14.61, longitude: 120.98 },
    { id: 'c', name: 'Destination', latitude: 14.62, longitude: 120.98 },
  ],
};
function createTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1', routeId: route.id, boardingIndex: 0, destinationIndex: 2,
    lastConfirmedIndex: 0, alertMode: 'every-stop', startedAt: new Date(0).toISOString(), status: 'active',
    approachedStopIds: [], arrivedStopIds: [], movingAwayCount: 0, directionAdvisorySent: false,
    offRouteCount: 0, routeDeviationSent: false, ...overrides,
  };
}
function fix(latitude: number, overrides: { accuracyM?: number | null } = {}) {
  return { latitude, longitude: 120.98, accuracyM: 10, timestamp: 1, ...overrides };
}

describe('destination alarm sequence', () => {
  it('announces an approaching next stop once', () => {
    const nearNext = fix(14.606);
    const first = evaluateLocationFix(route, createTrip(), nearNext);
    const second = evaluateLocationFix(route, first.trip, { ...nearNext, timestamp: 2 });
    expect(first.events.map((item) => item.type)).toEqual(['approaching']);
    expect(second.events).toEqual([]);
  });

  it('suppresses intermediate alerts in destination-only mode', () => {
    const result = evaluateLocationFix(route, createTrip({ alertMode: 'destination-only' }), fix(14.606));
    expect(result.events).toEqual([]);
    expect(result.trip.approachedStopIds).toContain('b');
  });

  it('advances in sequence when the next stop is reached', () => {
    const result = evaluateLocationFix(route, createTrip(), fix(14.61));
    expect(result.trip.lastConfirmedIndex).toBe(1);
    expect(result.events.map((item) => item.type)).toContain('stop-arrived');
  });

  it('completes at the destination and emits a destination alert', () => {
    const result = evaluateLocationFix(route, createTrip({ lastConfirmedIndex: 1 }), fix(14.62));
    expect(result.trip.status).toBe('completed');
    expect(result.events.map((item) => item.type)).toContain('destination-arrived');
  });

  it('ignores inaccurate location fixes', () => {
    const result = evaluateLocationFix(route, createTrip(), fix(14.606, { accuracyM: 160 }));
    expect(result.ignoredReason).toBe('poor-accuracy');
    expect(result.events).toEqual([]);
  });

  it('keeps route progress available through a manual fallback', () => {
    const result = manuallyConfirmNextStop(route, createTrip());
    expect(result.trip.lastConfirmedIndex).toBe(1);
    expect(result.events[0]?.type).toBe('stop-arrived');
  });

  it('surfaces a possible direction issue only after repeated movement away', () => {
    let trip = createTrip({ lastDestinationDistanceM: 2_000 });
    for (const [index, latitude] of [14.64, 14.65, 14.66].entries()) {
      trip = evaluateLocationFix(route, trip, { ...fix(latitude), timestamp: index + 1 }).trip;
    }
    expect(trip.directionAdvisorySent).toBe(true);
  });

  it('raises one coarse route-deviation advisory after repeated off-line fixes', () => {
    let trip = createTrip();
    for (const [index, latitude] of [14.61, 14.612, 14.614].entries()) {
      trip = evaluateLocationFix(route, trip, { latitude, longitude: 121.02, accuracyM: 10, timestamp: index + 1 }).trip;
    }
    expect(trip.routeDeviationSent).toBe(true);
  });
});
