import { useSyncExternalStore } from 'react';
import { getLocationFixProblem } from '../domain/location-quality';
import { UNMAPPED_ROUTE_PROBLEM } from '../domain/location-processing';
import type { StoredAppState } from '../services/storage';

export interface LiveLocationSnapshot {
  location: { latitude: number; longitude: number } | null;
  locationAt: number | null;
  accuracyM: number | null;
  problem: string | null;
  trackingProblem: string | null;
}

const listeners = new Set<() => void>();
let snapshot: LiveLocationSnapshot = {
  location: null, locationAt: null, accuracyM: null, problem: null, trackingProblem: null,
};

function publish(next: LiveLocationSnapshot): void {
  if (snapshot.locationAt === next.locationAt && snapshot.accuracyM === next.accuracyM
    && snapshot.location?.latitude === next.location?.latitude && snapshot.location?.longitude === next.location?.longitude
    && snapshot.problem === next.problem && snapshot.trackingProblem === next.trackingProblem) return;
  snapshot = next;
  for (const listener of listeners) {
    try { listener(); } catch { /* A screen observer must not fail a saved location batch. */ }
  }
}

export function publishLiveLocation(state: StoredAppState, options?: { reset?: boolean }): void {
  const problem = state.lastLocation && state.lastLocationAt !== null
    ? getLocationFixProblem({ ...state.lastLocation, timestamp: state.lastLocationAt, accuracyM: state.lastLocationAccuracyM }, Date.now())
    : 'invalid';
  // Stale persisted coordinates remain useful as explicitly last-known data.
  const usable = problem === null || problem === 'stale';
  const newer = usable && (snapshot.locationAt === null || state.lastLocationAt! >= snapshot.locationAt);
  const reset = options?.reset === true;
  publish({
    location: reset ? null : newer ? state.lastLocation : snapshot.location,
    locationAt: reset ? null : newer ? state.lastLocationAt : snapshot.locationAt,
    accuracyM: reset ? null : newer ? state.lastLocationAccuracyM : snapshot.accuracyM,
    problem: state.locationProblem === UNMAPPED_ROUTE_PROBLEM ? null : state.locationProblem,
    trackingProblem: snapshot.trackingProblem,
  });
}

export function setTrackingProblem(problem: string | null): void {
  publish({ ...snapshot, trackingProblem: problem });
}

export function getLiveLocation(): LiveLocationSnapshot { return snapshot; }

export function subscribeToLiveLocation(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useLiveLocation(): LiveLocationSnapshot {
  return useSyncExternalStore(subscribeToLiveLocation, getLiveLocation, getLiveLocation);
}
