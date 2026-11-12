import { describe, expect, it } from 'vitest';
import { buildBusRoute, deleteBusRoute, duplicateBusRoute, isBusRouteInUse, upsertBusRoute } from '../src/domain/bus-routes';
import type { TransitRoute, Trip } from '../src/domain/models';

const stops = [
  { id: 'a', name: 'Boarding', latitude: 14.6, longitude: 121 },
  { id: 'b', name: 'Destination', latitude: 14.61, longitude: 121.01 },
];
const route = buildBusRoute('bus-a', 'My route', stops);
const base = { customBusRoutes: [] as TransitRoute[], activeTrip: null as Trip | null, activeRoute: null as TransitRoute | null, destinationAlarms: ['preserve'] };

describe('bus route library', () => {
  it('rejects blank intermediate stops and invalid coordinate pairs rather than dropping them', () => {
    expect(() => buildBusRoute('bus', 'Route', [stops[0]!, { id: 'blank', name: ' ' }, stops[1]!])).toThrow('Name stop 2');
    expect(() => buildBusRoute('bus', 'Route', [{ ...stops[0]!, longitude: undefined }, stops[1]!])).toThrow('location for stop 1');
    expect(() => buildBusRoute('bus', 'Route', [{ ...stops[0]!, latitude: NaN }, stops[1]!])).toThrow('invalid');
    expect(() => buildBusRoute('bus', 'Route', [{ ...stops[0]!, latitude: 91 }, stops[1]!])).toThrow('invalid');
    expect(buildBusRoute('bus', 'Route', [{ id: 'a', name: 'A' }, stops[1]!]).coordinateStatus).toBe('missing');
  });

  it('appends against current library state and retries a committed save idempotently', () => {
    const other = buildBusRoute('bus-b', 'Other route', stops);
    const current = upsertBusRoute(base, other, null);
    const saved = upsertBusRoute(current, route, null);
    expect(saved.customBusRoutes.map((item) => item.id)).toEqual(['bus-b', 'bus-a']);
    expect(saved.destinationAlarms).toBe(base.destinationAlarms);
    expect(upsertBusRoute(saved, JSON.parse(JSON.stringify(route)), null)).toBe(saved);
    expect(() => upsertBusRoute(saved, { ...route, name: 'Different' }, null)).toThrow('already uses');
  });

  it('preserves active snapshots while editing and rejects stale or deleted templates', () => {
    const snapshot = { ...route, id: `${route.id}:a:b`, stops: route.stops.map((stop) => ({ ...stop })) };
    const current = { ...base, customBusRoutes: [route], activeRoute: snapshot };
    const edited = buildBusRoute(route.id, 'Edited route', [...stops].reverse());
    const saved = upsertBusRoute(current, edited, route);
    expect(saved.activeRoute).toBe(snapshot);
    expect(saved.activeRoute.stops[0]?.id).toBe('a');
    expect(saved.customBusRoutes[0]?.stops[0]?.id).toBe('b');
    expect(upsertBusRoute(saved, edited, route)).toBe(saved);
    expect(() => upsertBusRoute(saved, { ...edited, name: 'Another edit' }, route)).toThrow('changed');
    expect(() => upsertBusRoute(base, edited, route)).toThrow('removed');
  });

  it('protects active and completed unfinished trips from template deletion', () => {
    for (const status of ['active', 'completed'] as const) {
      const current = { ...base, customBusRoutes: [route], activeRoute: { ...route, id: `${route.id}:a:b` }, activeTrip: { status } as Trip };
      expect(isBusRouteInUse(current, route.id)).toBe(true);
      expect(() => deleteBusRoute(current, route.id, route)).toThrow('Finish or end');
    }
    const current = { ...base, customBusRoutes: [route] };
    expect(deleteBusRoute(current, route.id, route).customBusRoutes).toEqual([]);
    expect(() => deleteBusRoute({ ...current, customBusRoutes: [{ ...route, name: 'Changed' }] }, route.id, route)).toThrow('changed');
  });

  it('duplicates and reverses coordinates with fresh stop identities and correct direction', () => {
    const copy = duplicateBusRoute(route, 'copy');
    const reverse = duplicateBusRoute(route, 'reverse', true);
    expect(copy.name).toBe('My route (copy)');
    expect(reverse.direction).toBe('Destination to Boarding');
    expect(reverse.stops.map((stop) => stop.latitude)).toEqual([14.61, 14.6]);
    expect(reverse.stops.map((stop) => stop.id)).toEqual(['reverse-stop-1', 'reverse-stop-2']);
    expect(route.stops.map((stop) => stop.id)).toEqual(['a', 'b']);
    expect(reverse.coordinateStatus).toBe('complete');
  });
});
