import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TransitRoute, Trip } from '../domain/models';

const STORAGE_KEY = 'navo:state:v1';
export interface AppSettings {
  approachRadiusM: number;
  updateDistanceM: number;
  updateIntervalMs: number;
  sleepMode: boolean;
  appearance: 'light' | 'dark';
}
export interface StoredAppState {
  activeTrip: Trip | null;
  activeRoute: TransitRoute | null;
  customBusRoutes: TransitRoute[];
  settings: AppSettings;
  lastLocationAt: number | null;
  lastLocation: { latitude: number; longitude: number } | null;
  lastLocationAccuracyM: number | null;
  locationProblem: string | null;
  lastTripNotice: string | null;
}
export const defaultSettings: AppSettings = {
  approachRadiusM: 500,
  updateDistanceM: 75,
  updateIntervalMs: 20_000,
  sleepMode: true,
  appearance: 'light',
};
export const defaultAppState: StoredAppState = {
  activeTrip: null, activeRoute: null, customBusRoutes: [], settings: defaultSettings,
  lastLocationAt: null, lastLocation: null, lastLocationAccuracyM: null, locationProblem: null, lastTripNotice: null,
};

export async function readAppState(): Promise<StoredAppState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultAppState;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAppState>;
    return {
      ...defaultAppState,
      ...parsed,
      activeTrip: parsed.activeTrip ?? null,
      activeRoute: parsed.activeRoute ?? null,
      customBusRoutes: Array.isArray(parsed.customBusRoutes) ? parsed.customBusRoutes : [],
      settings: {
        ...defaultSettings,
        ...parsed.settings,
        appearance: parsed.settings?.appearance === 'dark' ? 'dark' : 'light',
      },
    };
  } catch {
    return defaultAppState;
  }
}

export async function writeAppState(state: StoredAppState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
