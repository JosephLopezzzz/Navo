import type { StoredAppState } from '../services/storage';
import { disarmDestinationAlarm, evaluateDestinationAlarmFix } from './destination-alarm';
import { getLocationFixProblem, MAX_FUTURE_FIX_SKEW_MS, type LocationFixProblem } from './location-quality';
import type { LocationFix, TripEvent } from './models';
import { evaluateLocationFix } from './trip-engine';

export const UNMAPPED_ROUTE_PROBLEM = 'A stop on this route has no location point. Use manual stop confirmation.';

const problemMessages: Record<LocationFixProblem, string> = {
  invalid: 'Location is unavailable. Waiting for a usable GPS reading.',
  'poor-accuracy': 'GPS is weak. Waiting for a more accurate location reading.',
  stale: 'Location updates are delayed. Waiting for a fresh GPS reading.',
  future: 'Location time is unreliable. Waiting for a fresh GPS reading.',
  'pre-session': 'Waiting for a location reading from this journey.',
};

export interface LocationBatchResult {
  state: StoredAppState;
  tripEvents: TripEvent[];
  acceptedFixes: number;
}

/** Reduce a complete OS batch once, so short arrivals are not lost between wakes. */
export function processLocationBatch(current: StoredAppState, fixes: readonly LocationFix[], now = Date.now()): LocationBatchResult {
  if (!current.destinationAlarms.some((alarm) => alarm.enabled) && current.activeTrip?.status !== 'active') {
    return { state: current, tripEvents: [], acceptedFixes: 0 };
  }
  let state = current;
  let acceptedFixes = 0;
  const tripEvents: TripEvent[] = [];
  const destinations = new Map(current.destinations.map((destination) => [destination.id, destination]));
  const ordered = [...fixes].sort((a, b) => {
    const first = Number.isFinite(a.timestamp) ? a.timestamp : Infinity;
    const second = Number.isFinite(b.timestamp) ? b.timestamp : Infinity;
    return first - second;
  });

  for (const fix of ordered) {
    // A previously stored malformed/future timestamp must not block recovery.
    const lastAt = state.lastLocationAt !== null && Number.isFinite(state.lastLocationAt)
      && state.lastLocationAt <= now + MAX_FUTURE_FIX_SKEW_MS ? state.lastLocationAt : null;
    if (Number.isFinite(fix.timestamp) && lastAt !== null && fix.timestamp <= lastAt) continue;
    const problem = getLocationFixProblem(fix, now);
    if (problem) {
      const message = problemMessages[problem];
      if (state.locationProblem !== message) state = { ...state, locationProblem: message };
      continue;
    }

    const tripStartedAt = state.activeTrip ? Date.parse(state.activeTrip.startedAt) : NaN;
    const tripResult = state.activeTrip?.status === 'active' && state.activeRoute
      && (!Number.isFinite(tripStartedAt) || fix.timestamp >= tripStartedAt)
      ? evaluateLocationFix(state.activeRoute, state.activeTrip, fix, state.settings.approachRadiusM)
      : null;
    tripEvents.push(...tripResult?.events ?? []);
    let arrivalMessage: string | undefined;
    const destinationAlarms = state.destinationAlarms.map((alarm) => {
      if (!alarm.enabled) return alarm;
      const destination = destinations.get(alarm.destinationId);
      if (!destination) return disarmDestinationAlarm(alarm);
      const evaluated = evaluateDestinationAlarmFix(destination, alarm, fix, now);
      arrivalMessage ??= evaluated.event?.message;
      return evaluated.alarm;
    });
    const advice = tripResult?.events.find((event) => event.type === 'possible-wrong-direction' || event.type === 'route-deviation');
    state = {
      ...state,
      activeTrip: tripResult?.trip ?? state.activeTrip,
      destinationAlarms,
      lastLocationAt: fix.timestamp,
      lastLocation: { latitude: fix.latitude, longitude: fix.longitude },
      lastLocationAccuracyM: fix.accuracyM,
      lastTripNotice: arrivalMessage ?? advice?.message ?? state.lastTripNotice,
      locationProblem: tripResult?.ignoredReason === 'unmapped-stop'
        ? UNMAPPED_ROUTE_PROBLEM : null,
    };
    acceptedFixes += 1;
  }
  return { state, tripEvents, acceptedFixes };
}
