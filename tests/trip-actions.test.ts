import { describe, expect, it } from 'vitest';
import { clearTripState, confirmTripStop, startTripState } from '../src/domain/trip-actions';
import type { TransitRoute, Trip } from '../src/domain/models';

const route: TransitRoute = {
  id: 'lrt-1:lrt1-1:lrt1-3', name: 'LRT-1', mode: 'rail', direction: 'A to C',
  dataQuality: 'preview', coordinateStatus: 'missing', sourceLabel: 'Station order',
  stops: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
};
const trip: Trip = {
  id: 'trip-1', routeId: route.id, boardingIndex: 0, destinationIndex: 2, lastConfirmedIndex: 0,
  alertMode: 'destination-only', startedAt: '2026-11-12T00:00:00Z', status: 'active',
  approachedStopIds: [], arrivedStopIds: [], movingAwayCount: 0, directionAdvisorySent: false,
  offRouteCount: 0, routeDeviationSent: false,
};

function state(activeTrip: Trip | null = null, activeRoute: TransitRoute | null = null) {
  return {
    activeTrip, activeRoute, settings: { sleepMode: false, appearance: 'dark' },
    destinationAlarms: [{ id: 'alarm-1', enabled: true, sessionId: 'alarm-session' }],
    destinations: [{ id: 'saved-destination' }],
    lastLocation: { latitude: 14.6, longitude: 121 } as { latitude: number; longitude: number } | null,
    lastLocationAt: 100 as number | null, lastLocationAccuracyM: 20 as number | null,
    lastTripNotice: 'Old trip notice' as string | null, locationProblem: 'Old location problem' as string | null,
  };
}

describe('trip state actions', () => {
  it('starts a snapshot while preserving independent destination alarms and route coordinate boundaries', () => {
    const current = state();
    const journey = structuredClone(route);
    const next = startTripState(current, journey, trip, null);
    expect(next.destinationAlarms).toBe(current.destinationAlarms);
    expect(next.destinations).toBe(current.destinations);
    expect(next.settings).toEqual({ sleepMode: true, appearance: 'dark' });
    expect(next.activeRoute?.coordinateStatus).toBe('missing');
    expect(next.activeRoute?.stops.every((stop) => stop.latitude === undefined)).toBe(true);
    expect(next.lastLocation).toBeNull();
    expect(next.lastLocationAt).toBeNull();
    expect(next.locationProblem).toBeNull();
    journey.stops[0]!.name = 'Changed template';
    expect(next.activeRoute?.stops[0]?.name).toBe('A');
    expect(current.activeTrip).toBeNull();
  });

  it('requires the explicit unfinished trip ID to replace active or completed progress', () => {
    const nextTrip = { ...trip, id: 'trip-2' };
    for (const status of ['active', 'completed'] as const) {
      const current = state({ ...trip, status }, route);
      expect(() => startTripState(current, route, nextTrip, null)).toThrow('current trip changed');
      expect(() => startTripState(current, route, nextTrip, 'stale-trip')).toThrow('current trip changed');
      expect(startTripState(current, route, nextTrip, trip.id).activeTrip?.id).toBe('trip-2');
    }
  });

  it('treats cancelled progress as no unfinished trip and explains an unmapped manual trip', () => {
    const current = { ...state({ ...trip, status: 'cancelled' }, route), destinationAlarms: [] };
    const next = startTripState(current, route, { ...trip, id: 'trip-2' }, null);
    expect(next.activeTrip?.id).toBe('trip-2');
    expect(next.locationProblem).toContain('manual stop confirmation');
  });

  it('allows a rendered next-stop confirmation to advance only once', () => {
    const current = state(trip, route);
    const first = confirmTripStop(current, trip.id, 0);
    const second = confirmTripStop(first.state, trip.id, 0);
    expect(first.result?.trip.lastConfirmedIndex).toBe(1);
    expect(first.result?.trip.arrivedStopIds).toEqual(['b']);
    expect(second.result).toBeNull();
    expect(second.state).toBe(first.state);
    const destination = confirmTripStop(first.state, trip.id, 1);
    expect(destination.result?.trip.status).toBe('completed');
    expect(destination.result?.events[0]?.type).toBe('destination-arrived');
    expect(confirmTripStop(destination.state, trip.id, 2).result).toBeNull();
  });

  it('ignores a stale screen after replacement or background advancement', () => {
    const replacement = state({ ...trip, id: 'new-trip' }, route);
    expect(confirmTripStop(replacement, trip.id, 0).state).toBe(replacement);
    const advanced = state({ ...trip, lastConfirmedIndex: 1, arrivedStopIds: ['b'] }, route);
    expect(confirmTripStop(advanced, trip.id, 0).state).toBe(advanced);
    const mismatchedRoute = state(trip, { ...route, id: 'different-route' });
    expect(confirmTripStop(mismatchedRoute, trip.id, 0).state).toBe(mismatchedRoute);
  });

  it('clears only the requested trip without clearing independent alarm or location state', () => {
    const current = state(trip, route);
    expect(clearTripState(current, 'older-trip')).toBe(current);
    const next = clearTripState(current, trip.id);
    expect(next.activeTrip).toBeNull();
    expect(next.activeRoute).toBeNull();
    expect(next.lastTripNotice).toBeNull();
    expect(next.locationProblem).toBeNull();
    expect(next.destinationAlarms).toBe(current.destinationAlarms);
    expect(next.lastLocation).toBe(current.lastLocation);
  });
});
