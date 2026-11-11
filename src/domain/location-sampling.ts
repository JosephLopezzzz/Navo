import type { StoredAppState } from '../services/storage';
import { distanceBetweenCoordinatesM } from './destination-alarm';
import { getLocationFixProblem, hasValidCoordinates } from './location-quality';

export type LocationSamplingProfile = 'recovery' | 'departure' | 'far' | 'approaching' | 'near';
export interface LocationSamplingPolicy {
  profile: LocationSamplingProfile;
  accuracy: 'balanced' | 'high';
  timeInterval: number;
  distanceInterval: number;
  pausesUpdatesAutomatically: boolean;
}

const RECOVERY: LocationSamplingPolicy = { profile: 'recovery', accuracy: 'high', timeInterval: 5_000, distanceInterval: 10, pausesUpdatesAutomatically: false };
const DEPARTURE: LocationSamplingPolicy = { profile: 'departure', accuracy: 'balanced', timeInterval: 10_000, distanceInterval: 25, pausesUpdatesAutomatically: true };

/** One request serves every alarm and the next mapped route stop. */
export function getLocationSamplingPolicy(state: StoredAppState, now = Date.now(), speedMps?: number | null): LocationSamplingPolicy {
  if (!state.lastLocation || state.lastLocationAt === null || getLocationFixProblem({
    ...state.lastLocation, timestamp: state.lastLocationAt, accuracyM: state.lastLocationAccuracyM,
  }, now)) return { ...RECOVERY };

  let boundaryDistanceM = Infinity;
  let waitingInside = false;
  let needsRecovery = false;
  let needsConfirmation = false;
  const uncertaintyM = state.lastLocationAccuracyM ?? 0;
  // Even a reported stationary sample cannot justify sleeping through a fast ride.
  const conservativeSpeedMps = Math.max(35, Number.isFinite(speedMps) && speedMps! > 0 ? speedMps! : 0);
  const ageSeconds = Math.max(0, now - state.lastLocationAt) / 1_000;
  const destinations = new Map(state.destinations.map((destination) => [destination.id, destination]));
  for (const alarm of state.destinationAlarms) {
    if (!alarm.enabled) continue;
    const destination = destinations.get(alarm.destinationId);
    if (!destination || !hasValidCoordinates(destination) || !Number.isFinite(alarm.radiusM) || alarm.radiusM < 0) {
      needsRecovery = true;
      continue;
    }
    // A new session needs a new fix even if another alarm has a recent snapshot.
    if (alarm.armedAt !== null && state.lastLocationAt < alarm.armedAt) {
      needsRecovery = true;
      continue;
    }
    const distanceM = distanceBetweenCoordinatesM(state.lastLocation, destination);
    if (alarm.watchState === 'awaiting-exit' && distanceM + uncertaintyM + conservativeSpeedMps * ageSeconds <= alarm.radiusM) {
      waitingInside = true;
      continue;
    }
    if (alarm.watchState === 'monitoring' && alarm.consecutiveInsideFixes === 1
      && alarm.lastFixAt !== null && now - alarm.lastFixAt <= 30_000
      && !getLocationFixProblem({ ...state.lastLocation, timestamp: alarm.lastFixAt, accuracyM: state.lastLocationAccuracyM }, now, alarm.armedAt)) needsConfirmation = true;
    boundaryDistanceM = Math.min(boundaryDistanceM, distanceM - alarm.radiusM - uncertaintyM);
  }
  if (state.activeTrip?.status === 'active' && state.activeRoute) {
    const trip = state.activeTrip;
    const next = state.activeRoute.stops[Math.min(trip.lastConfirmedIndex + 1, trip.destinationIndex)];
    if (next?.latitude !== undefined && next.longitude !== undefined && hasValidCoordinates({ latitude: next.latitude, longitude: next.longitude })) {
      boundaryDistanceM = Math.min(boundaryDistanceM, distanceBetweenCoordinatesM(state.lastLocation, { latitude: next.latitude, longitude: next.longitude }) - state.settings.approachRadiusM - uncertaintyM);
    }
  }
  // The distance filter must not starve the second confirmation when a rider stops.
  if (needsConfirmation) return { profile: 'near', accuracy: 'high', timeInterval: 2_000, distanceInterval: 0, pausesUpdatesAutomatically: false };
  if (needsRecovery) return { ...RECOVERY };
  if (!Number.isFinite(boundaryDistanceM)) return waitingInside ? { ...DEPARTURE } : { ...RECOVERY };
  const remainingM = boundaryDistanceM - conservativeSpeedMps * ageSeconds;
  const safeTimeMs = Math.max(2_000, remainingM / conservativeSpeedMps * 1_000 / 3);
  if (remainingM <= 1_000 || safeTimeMs <= 5_000) {
    return { profile: 'near', accuracy: 'high', timeInterval: 2_000, distanceInterval: 10, pausesUpdatesAutomatically: false };
  }
  if (remainingM <= 3_000 || safeTimeMs < 20_000) {
    return { profile: 'approaching', accuracy: 'high', timeInterval: Math.min(5_000, safeTimeMs), distanceInterval: 25, pausesUpdatesAutomatically: false };
  }
  const requestedTimeMs = Number.isFinite(state.settings.updateIntervalMs) ? state.settings.updateIntervalMs : 20_000;
  const requestedDistanceM = Number.isFinite(state.settings.updateDistanceM) ? state.settings.updateDistanceM : 75;
  if (waitingInside) return { ...DEPARTURE };
  return {
    profile: 'far', accuracy: 'balanced',
    timeInterval: Math.max(20_000, Math.min(30_000, requestedTimeMs, safeTimeMs)),
    distanceInterval: Math.max(75, Math.min(150, requestedDistanceM)),
    pausesUpdatesAutomatically: true,
  };
}
