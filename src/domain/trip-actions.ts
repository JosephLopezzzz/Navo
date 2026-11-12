import type { EvaluationResult, TransitRoute, Trip } from './models';
import { manuallyConfirmNextStop } from './trip-engine';

interface TripActionState {
  activeTrip: Trip | null;
  activeRoute: TransitRoute | null;
  settings: { sleepMode: boolean };
  destinationAlarms: readonly { enabled: boolean }[];
  lastLocation: { latitude: number; longitude: number } | null;
  lastLocationAt: number | null;
  lastLocationAccuracyM: number | null;
  lastTripNotice: string | null;
  locationProblem: string | null;
}

/** The expected ID is the trip the rider agreed to replace, or null for no trip. */
export function startTripState<T extends TripActionState>(state: T, journey: TransitRoute, trip: Trip, expectedTripId: string | null): T {
  const unfinishedId = state.activeTrip?.status === 'cancelled' ? null : state.activeTrip?.id ?? null;
  if (unfinishedId !== expectedTripId) throw new Error('Your current trip changed. Review it before starting another trip.');
  const locationReady = journey.coordinateStatus === 'complete'
    && journey.stops.every((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude));
  return {
    ...state,
    activeTrip: { ...trip, approachedStopIds: [...trip.approachedStopIds], arrivedStopIds: [...trip.arrivedStopIds] },
    activeRoute: { ...journey, stops: journey.stops.map((stop) => ({ ...stop })) },
    settings: { ...state.settings, sleepMode: trip.alertMode === 'destination-only' },
    lastLocation: null,
    lastLocationAt: null,
    lastLocationAccuracyM: null,
    lastTripNotice: null,
    locationProblem: locationReady || state.destinationAlarms.some((alarm) => alarm.enabled)
      ? null
      : 'This route has no verified location points. Use manual stop confirmation.',
  };
}

/** A rendered confirmation can advance its expected stop once, including after an async write. */
export function confirmTripStop<T extends TripActionState>(state: T, expectedTripId: string, expectedLastConfirmedIndex: number): { state: T; result: EvaluationResult | null } {
  const trip = state.activeTrip;
  const route = state.activeRoute;
  if (!trip || !route || trip.id !== expectedTripId || trip.status !== 'active'
    || trip.lastConfirmedIndex !== expectedLastConfirmedIndex || trip.routeId !== route.id) return { state, result: null };
  const result = manuallyConfirmNextStop(route, trip);
  if (result.trip === trip) return { state, result: null };
  return { state: { ...state, activeTrip: result.trip }, result };
}

/** Ending an older screen or dialog must not clear a replacement trip. */
export function clearTripState<T extends TripActionState>(state: T, expectedTripId: string): T {
  if (state.activeTrip?.id !== expectedTripId) return state;
  return { ...state, activeTrip: null, activeRoute: null, locationProblem: null, lastTripNotice: null };
}
