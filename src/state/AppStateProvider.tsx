import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { defaultFirstRunState, defaultSettings, readAppState, updateAppState, type StoredAppState } from '../services/storage';
import { subscribeToAppStateChanges, visibleAppStateSignature } from './app-state-events';
import { publishLiveLocation } from './live-location';

interface AppStateContextValue extends StoredAppState {
  ready: boolean;
  storageProblem: string | null;
  updateState: (patch: Partial<StoredAppState>) => Promise<void>;
  mutateState: (mutate: (current: StoredAppState) => StoredAppState) => Promise<StoredAppState>;
  refreshState: () => Promise<void>;
}
const AppStateContext = createContext<AppStateContextValue | null>(null);
const STORAGE_PROBLEM = 'Saved trip data could not be read from this device. Check available storage and try again.';
const STORAGE_TIMEOUT = 'Saved trip data is taking longer than expected to load. Check available storage and try again.';
const STORAGE_TIMEOUT_MS = 12_000;

async function readAppStateWithTimeout(): Promise<StoredAppState> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readAppState(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('NAVO_STORAGE_TIMEOUT')), STORAGE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<StoredAppState | null>(null);
  const [storageProblem, setStorageProblem] = useState<string | null>(null);
  const hasLoadedState = useRef(false);

  const refreshState = useCallback(async () => {
    try {
      const latest = await readAppStateWithTimeout();
      publishLiveLocation(latest);
      setState(latest);
      hasLoadedState.current = true;
      setStorageProblem(null);
    } catch (error) {
      if (error instanceof Error && error.message === 'NAVO_STORAGE_TIMEOUT' && hasLoadedState.current) return;
      setStorageProblem(error instanceof Error && error.message === 'NAVO_STORAGE_TIMEOUT' ? STORAGE_TIMEOUT : STORAGE_PROBLEM);
    }
  }, []);

  const mutateState = useCallback(async (mutate: (current: StoredAppState) => StoredAppState) => {
    try {
      const latest = await updateAppState(mutate);
      setState(latest);
      hasLoadedState.current = true;
      setStorageProblem(null);
      return latest;
    } catch (error) {
      setStorageProblem(STORAGE_PROBLEM);
      throw error;
    }
  }, []);

  const updateState = useCallback(async (patch: Partial<StoredAppState>) => {
    await mutateState((current) => ({
      ...current,
      ...patch,
      settings: patch.settings ? { ...current.settings, ...patch.settings } : current.settings,
    }));
  }, [mutateState]);

  useEffect(() => subscribeToAppStateChanges((latest, source) => {
    setState((current) => source === 'location' && current
      && visibleAppStateSignature(current) === visibleAppStateSignature(latest) ? current : latest);
  }), []);

  useEffect(() => {
    let mounted = true;
    const timeout = setTimeout(() => {
      if (mounted && !hasLoadedState.current) setStorageProblem(STORAGE_TIMEOUT);
    }, STORAGE_TIMEOUT_MS);
    void readAppState().then((saved) => {
      if (mounted) {
        publishLiveLocation(saved);
        setState(saved);
        hasLoadedState.current = true;
        setStorageProblem(null);
      }
    }).catch(() => {
      if (mounted && !hasLoadedState.current) setStorageProblem(STORAGE_PROBLEM);
    }).finally(() => clearTimeout(timeout));
    return () => { mounted = false; clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refreshState();
    });
    return () => subscription.remove();
  }, [refreshState]);

  const hasActiveLocationWork = Boolean(state?.activeTrip?.status === 'active'
    || state?.destinationAlarms.some((alarm) => alarm.enabled));
  useEffect(() => {
    if (!hasActiveLocationWork) return;
    // Recovery for location tasks launched in a separate headless JS runtime.
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void refreshState();
    }, 30_000);
    return () => clearInterval(interval);
  }, [hasActiveLocationWork, refreshState]);

  const value = useMemo<AppStateContextValue>(() => ({
    schemaVersion: 5,
    activeTrip: state?.activeTrip ?? null,
    activeRoute: state?.activeRoute ?? null,
    customBusRoutes: state?.customBusRoutes ?? [],
    destinations: state?.destinations ?? [],
    destinationAlarms: state?.destinationAlarms ?? [],
    importedAlarmSounds: state?.importedAlarmSounds ?? [],
    settings: state?.settings ?? defaultSettings,
    firstRun: state?.firstRun ?? defaultFirstRunState,
    lastLocationAt: state?.lastLocationAt ?? null,
    lastLocation: state?.lastLocation ?? null,
    lastLocationAccuracyM: state?.lastLocationAccuracyM ?? null,
    locationProblem: state?.locationProblem ?? null,
    lastTripNotice: state?.lastTripNotice ?? null,
    ready: state !== null,
    storageProblem,
    updateState,
    mutateState,
    refreshState,
  }), [state, storageProblem, updateState, mutateState, refreshState]);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside AppStateProvider');
  return value;
}
