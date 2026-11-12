import type { Stop, TransitRoute, Trip } from './models';

interface RouteLibraryState {
  customBusRoutes: TransitRoute[];
  activeTrip: Trip | null;
  activeRoute: TransitRoute | null;
}

const BUS_SOURCE = 'Stop order and any saved coordinates were entered by you; Navo has not checked this route against operator data.';

export function buildBusRoute(id: string, name: string, drafts: readonly Stop[]): TransitRoute {
  if (!id.trim()) throw new Error('This route needs an ID. Reopen the editor and try again.');
  if (name.trim().length < 2) throw new Error('Enter a route name with at least two characters.');
  if (drafts.length < 2) throw new Error('Add at least two stops, including boarding and destination.');
  const seen = new Set<string>();
  const stops = drafts.map((stop, index): Stop => {
    if (!stop.name.trim()) throw new Error(`Name stop ${index + 1}, or remove it before saving.`);
    if (!stop.id || seen.has(stop.id)) throw new Error('Each stop needs its own ID. Reopen the editor and try again.');
    seen.add(stop.id);
    if (stop.latitude === undefined && stop.longitude === undefined) return { id: stop.id, name: stop.name.trim() };
    if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)
      || stop.latitude! < -90 || stop.latitude! > 90 || stop.longitude! < -180 || stop.longitude! > 180) {
      throw new Error(`The saved location for stop ${index + 1} is invalid. Record it again or clear its location.`);
    }
    return { id: stop.id, name: stop.name.trim(), latitude: stop.latitude, longitude: stop.longitude };
  });
  return {
    id, name: name.trim(), mode: 'bus',
    direction: `${stops[0]!.name} to ${stops[stops.length - 1]!.name}`,
    dataQuality: 'user-authored',
    coordinateStatus: stops.every((stop) => stop.latitude !== undefined && stop.longitude !== undefined) ? 'complete' : 'missing',
    sourceLabel: BUS_SOURCE,
    stops,
  };
}

function routeSignature(route: TransitRoute): string {
  return JSON.stringify([
    route.id, route.name, route.mode, route.direction, route.dataQuality,
    route.coordinateStatus, route.sourceLabel, route.sourceUrl ?? null,
    route.stops.map((stop) => [stop.id, stop.name, stop.latitude ?? null, stop.longitude ?? null]),
  ]);
}

export function upsertBusRoute<T extends RouteLibraryState>(state: T, route: TransitRoute, expectedRoute: TransitRoute | null): T {
  const index = state.customBusRoutes.findIndex((item) => item.id === route.id);
  const current = state.customBusRoutes[index];
  // A previous write can commit before its caller sees an error. Retrying the
  // same stable ID and content is a successful save, never a second route.
  if (current && routeSignature(current) === routeSignature(route)) return state;
  if (expectedRoute) {
    if (expectedRoute.id !== route.id || !current || routeSignature(current) !== routeSignature(expectedRoute)) {
      throw new Error('This saved route changed or was removed. Your draft is still here. Reopen the route before saving again.');
    }
    return { ...state, customBusRoutes: state.customBusRoutes.map((item, itemIndex) => itemIndex === index ? route : item) };
  }
  if (current) throw new Error('A different route already uses this ID. Reopen the editor and try again.');
  return { ...state, customBusRoutes: [...state.customBusRoutes, route] };
}

export function isBusRouteInUse(state: RouteLibraryState, routeId: string): boolean {
  return Boolean(state.activeTrip && state.activeTrip.status !== 'cancelled' && state.activeRoute
    && (state.activeRoute.id === routeId || state.activeRoute.id.startsWith(`${routeId}:`)));
}

export function deleteBusRoute<T extends RouteLibraryState>(state: T, routeId: string, expectedRoute?: TransitRoute): T {
  const current = state.customBusRoutes.find((route) => route.id === routeId);
  if (!current) return state;
  if (isBusRouteInUse(state, routeId)) throw new Error('Finish or end the trip using this route before deleting it.');
  if (expectedRoute && routeSignature(current) !== routeSignature(expectedRoute)) {
    throw new Error('This route changed after you opened its actions. Review it before deleting.');
  }
  return { ...state, customBusRoutes: state.customBusRoutes.filter((route) => route.id !== routeId) };
}

export function duplicateBusRoute(route: TransitRoute, newId: string, reverse = false): TransitRoute {
  const stops = reverse ? [...route.stops].reverse() : route.stops;
  return buildBusRoute(newId, `${route.name}${reverse ? ' (reversed)' : ' (copy)'}`,
    stops.map((stop, index) => ({ ...stop, id: `${newId}-stop-${index + 1}` })));
}
