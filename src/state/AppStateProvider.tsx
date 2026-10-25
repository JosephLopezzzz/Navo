import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { defaultSettings, readAppState, writeAppState, type StoredAppState } from '../services/storage';

interface AppStateContextValue extends StoredAppState {
  ready: boolean;
  storageProblem: string | null;
  updateState: (patch: Partial<StoredAppState>) => void;
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

  const updateState = useCallback((patch: Partial<StoredAppState>) => {
    setState((previous) => {
      const updated = { ...(previous ?? {}), ...patch } as StoredAppState;
      void writeAppState(updated);
      return updated;
    });
  }, []);

  const value = useMemo<AppStateContextValue>(() => ({
    activeTrip: state?.activeTrip ?? null,
    activeRoute: state?.activeRoute ?? null,
    customBusRoutes: state?.customBusRoutes ?? [],
    settings: state?.settings ?? defaultSettings,
    lastLocationAt: state?.lastLocationAt ?? null,
    lastLocation: state?.lastLocation ?? null,
    lastLocationAccuracyM: state?.lastLocationAccuracyM ?? null,
    locationProblem: state?.locationProblem ?? null,
    lastTripNotice: state?.lastTripNotice ?? null,
    ready: state !== null,
    storageProblem,
    updateState,
    refreshState,
  }), [state, storageProblem, updateState, refreshState]);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside AppStateProvider');
  return value;
}
