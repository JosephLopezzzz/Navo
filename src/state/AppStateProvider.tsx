import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { defaultSettings, readAppState, updateAppState, type StoredAppState } from '../services/storage';

interface AppStateContextValue extends StoredAppState {
  ready: boolean;
  storageProblem: string | null;
  updateState: (patch: Partial<StoredAppState>) => Promise<void>;
  mutateState: (mutate: (current: StoredAppState) => StoredAppState) => Promise<StoredAppState>;
  refreshState: () => Promise<void>;
}
const AppStateContext = createContext<AppStateContextValue | null>(null);
const STORAGE_PROBLEM = 'Saved trip data could not be read from this device. Check available storage and try again.';

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<StoredAppState | null>(null);
  const [storageProblem, setStorageProblem] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    try {
      setState(await readAppState());
      setStorageProblem(null);
    } catch {
      setStorageProblem(STORAGE_PROBLEM);
    }
  }, []);

  const mutateState = useCallback(async (mutate: (current: StoredAppState) => StoredAppState) => {
    try {
      await updateAppState(mutate);
      const latest = await readAppState();
      setState(latest);
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

  useEffect(() => {
    let mounted = true;
    void readAppState().then((saved) => {
      if (mounted) {
        setState(saved);
        setStorageProblem(null);
      }
    }).catch(() => {
      if (mounted) setStorageProblem(STORAGE_PROBLEM);
    });
    return () => { mounted = false; };
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
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void refreshState();
    }, 15_000);
    return () => clearInterval(interval);
  }, [hasActiveLocationWork, refreshState]);

  const value = useMemo<AppStateContextValue>(() => ({
    schemaVersion: 2,
    activeTrip: state?.activeTrip ?? null,
    activeRoute: state?.activeRoute ?? null,
    customBusRoutes: state?.customBusRoutes ?? [],
    destinations: state?.destinations ?? [],
    destinationAlarms: state?.destinationAlarms ?? [],
    settings: state?.settings ?? defaultSettings,
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
