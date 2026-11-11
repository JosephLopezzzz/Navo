import type { StoredAppState } from '../services/storage';

export type StateChangeSource = 'mutation' | 'location';
type StateChangeListener = (state: StoredAppState, source: StateChangeSource) => void;
const listeners = new Set<StateChangeListener>();

export function subscribeToAppStateChanges(listener: StateChangeListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Runs only after the SQLite transaction has committed. */
export function publishAppStateChange(state: StoredAppState, source: StateChangeSource): void {
  for (const listener of listeners) {
    // UI observer failures cannot change the result of an already committed save.
    try { listener(state, source); } catch { /* Other observers still receive the commit. */ }
  }
}

/** Distance telemetry has its own subscription; it need not render every screen. */
export function visibleAppStateSignature(state: StoredAppState): string {
  return JSON.stringify({
    ...state,
    lastLocation: null,
    lastLocationAt: null,
    lastLocationAccuracyM: null,
    activeTrip: state.activeTrip ? { ...state.activeTrip, lastDestinationDistanceM: undefined } : null,
    destinationAlarms: state.destinationAlarms.map((alarm) => ({
      ...alarm, lastDistanceM: null, lastFixAt: null, consecutiveInsideFixes: 0,
    })),
  });
}
