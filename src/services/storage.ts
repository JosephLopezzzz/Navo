import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import type { DestinationAlarm, SavedDestination, TransitRoute, Trip } from '../domain/models';

const STORAGE_KEY = 'navo:state:v1';
const DATABASE_NAME = 'navo-state.db';
const STATE_ROW_ID = 1;
export interface AppSettings {
  approachRadiusM: number;
  updateDistanceM: number;
  updateIntervalMs: number;
  sleepMode: boolean;
  appearance: 'light' | 'dark';
}
export interface StoredAppState {
  schemaVersion: 2;
  activeTrip: Trip | null;
  activeRoute: TransitRoute | null;
  customBusRoutes: TransitRoute[];
  destinations: SavedDestination[];
  destinationAlarms: DestinationAlarm[];
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
  schemaVersion: 2,
  activeTrip: null,
  activeRoute: null,
  customBusRoutes: [],
  destinations: [],
  destinationAlarms: [],
  settings: defaultSettings,
  lastLocationAt: null, lastLocation: null, lastLocationAccuracyM: null, locationProblem: null, lastTripNotice: null,
};

export function normalizeAppState(value: unknown): StoredAppState {
  if (!value || typeof value !== 'object') return defaultAppState;
  const parsed = value as Partial<StoredAppState>;
  return {
    ...defaultAppState,
    ...parsed,
    schemaVersion: 2,
    activeTrip: parsed.activeTrip ?? null,
    activeRoute: parsed.activeRoute ?? null,
    customBusRoutes: Array.isArray(parsed.customBusRoutes) ? parsed.customBusRoutes : [],
    destinations: Array.isArray(parsed.destinations) ? parsed.destinations : [],
    destinationAlarms: Array.isArray(parsed.destinationAlarms) ? parsed.destinationAlarms : [],
    settings: {
      ...defaultSettings,
      ...parsed.settings,
      appearance: parsed.settings?.appearance === 'dark' ? 'dark' : 'light',
    },
  };
}

function parseStoredValue(raw: string | null): StoredAppState {
  if (!raw) return defaultAppState;
  try {
    return normalizeAppState(JSON.parse(raw));
  } catch {
    return defaultAppState;
  }
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openStateDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
      value TEXT NOT NULL
    );
  `);
  await withDatabaseRetry(() => database.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_state WHERE id = ?',
      STATE_ROW_ID,
    );
    if (row) return;

    const legacy = parseStoredValue(await AsyncStorage.getItem(STORAGE_KEY));
    await transaction.runAsync(
      'INSERT OR IGNORE INTO app_state (id, value) VALUES (?, ?)',
      STATE_ROW_ID,
      JSON.stringify(legacy),
    );
  }));
  return database;
}

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openStateDatabase().catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

async function withDatabaseRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('database is locked') || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    }
  }
}

export async function readAppState(): Promise<StoredAppState> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_state WHERE id = ?',
    STATE_ROW_ID,
  );
  return parseStoredValue(row?.value ?? null);
}

export async function updateAppState(
  mutate: (current: StoredAppState) => StoredAppState,
): Promise<StoredAppState> {
  const database = await getDatabase();
  let updated: StoredAppState | null = null;
  await withDatabaseRetry(() => database.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_state WHERE id = ?',
      STATE_ROW_ID,
    );
    const current = parseStoredValue(row?.value ?? null);
    updated = normalizeAppState(mutate(current));
    await transaction.runAsync(
      'INSERT INTO app_state (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value',
      STATE_ROW_ID,
      JSON.stringify(updated),
    );
  }));
  if (!updated) throw new Error('Navo could not save the latest device state.');
  return updated;
}
