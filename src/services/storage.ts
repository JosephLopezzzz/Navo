import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import type { DestinationAlarm, DestinationKind, SavedDestination, TransitRoute, Trip } from '../domain/models';
import { DEFAULT_ALARM_TONE_ID, isAlarmToneId } from '../domain/alarm-tones';
import { normalizeImportedSounds, type ImportedAlarmSound } from '../domain/imported-alarm-sounds';
import { normalizeRailDestinationMetadata } from '../domain/rail-destination';
import { publishAppStateChange, type StateChangeSource } from '../state/app-state-events';
import { publishLiveLocation } from '../state/live-location';

const STORAGE_KEY = 'navo:state:v1';
const DATABASE_NAME = 'navo-state.db';
const STATE_ROW_ID = 1;
export interface AppSettings {
  monitoringAlarmId?: string | null;
  approachRadiusM: number;
  updateDistanceM: number;
  updateIntervalMs: number;
  sleepMode: boolean;
  appearance: 'system' | 'light' | 'dark';
  locationNoticeDismissed: boolean;
}
export interface OnboardingPreferences {
  displayName: string;
  useFor: 'sleep' | 'focus' | 'both';
  preferredMode: DestinationKind;
  preferredRailLineId: string;
}
export interface FirstRunState {
  legalAcknowledgement: { version: string; acknowledgedAt: string } | null;
  onboardingComplete: boolean;
  preferences: OnboardingPreferences;
  guideCompleted: boolean;
  permissionNoticeAlarmId: string | null;
}
export interface StoredAppState {
  schemaVersion: 5;
  activeTrip: Trip | null;
  activeRoute: TransitRoute | null;
  customBusRoutes: TransitRoute[];
  destinations: SavedDestination[];
  destinationAlarms: DestinationAlarm[];
  importedAlarmSounds: ImportedAlarmSound[];
  settings: AppSettings;
  firstRun: FirstRunState;
  lastLocationAt: number | null;
  lastLocation: { latitude: number; longitude: number } | null;
  lastLocationAccuracyM: number | null;
  locationProblem: string | null;
  lastTripNotice: string | null;
}
export const defaultSettings: AppSettings = {
  monitoringAlarmId: null,
  approachRadiusM: 500,
  updateDistanceM: 75,
  updateIntervalMs: 20_000,
  sleepMode: true,
  appearance: 'light',
  locationNoticeDismissed: false,
};
export const defaultOnboardingPreferences: OnboardingPreferences = {
  displayName: '',
  useFor: 'both',
  preferredMode: 'rail-station',
  preferredRailLineId: 'lrt-1',
};
export const defaultFirstRunState: FirstRunState = {
  legalAcknowledgement: null,
  onboardingComplete: false,
  preferences: defaultOnboardingPreferences,
  guideCompleted: false,
  permissionNoticeAlarmId: null,
};
export const defaultAppState: StoredAppState = {
  schemaVersion: 5,
  activeTrip: null,
  activeRoute: null,
  customBusRoutes: [],
  destinations: [],
  destinationAlarms: [],
  importedAlarmSounds: [],
  settings: defaultSettings,
  firstRun: defaultFirstRunState,
  lastLocationAt: null, lastLocation: null, lastLocationAccuracyM: null, locationProblem: null, lastTripNotice: null,
};

export function normalizeAppState(value: unknown): StoredAppState {
  if (!value || typeof value !== 'object') return defaultAppState;
  const parsed = value as Partial<StoredAppState>;
  const importedAlarmSounds = normalizeImportedSounds(parsed.importedAlarmSounds);
  return {
    ...defaultAppState,
    ...parsed,
    schemaVersion: 5,
    importedAlarmSounds,
    activeTrip: parsed.activeTrip ?? null,
    activeRoute: parsed.activeRoute ?? null,
    customBusRoutes: Array.isArray(parsed.customBusRoutes) ? parsed.customBusRoutes : [],
    destinations: Array.isArray(parsed.destinations) ? parsed.destinations.map(normalizeRailDestinationMetadata) : [],
    destinationAlarms: Array.isArray(parsed.destinationAlarms)
      ? parsed.destinationAlarms.map((alarm) => ({
        ...alarm,
        ringtoneId: isAlarmToneId(alarm?.ringtoneId, importedAlarmSounds) ? alarm.ringtoneId : DEFAULT_ALARM_TONE_ID,
      }))
      : [],
    settings: {
      ...defaultSettings,
      ...parsed.settings,
      monitoringAlarmId: typeof parsed.settings?.monitoringAlarmId === 'string' ? parsed.settings.monitoringAlarmId : null,
      appearance: parsed.settings?.appearance === 'dark'
        ? 'dark'
        : parsed.settings?.appearance === 'system' ? 'system' : 'light',
      locationNoticeDismissed: parsed.settings?.locationNoticeDismissed === true,
    },
    firstRun: {
      ...defaultFirstRunState,
      ...parsed.firstRun,
      legalAcknowledgement: parsed.firstRun?.legalAcknowledgement
        && typeof parsed.firstRun.legalAcknowledgement.version === 'string'
        && typeof parsed.firstRun.legalAcknowledgement.acknowledgedAt === 'string'
        && parsed.firstRun.legalAcknowledgement.acknowledgedAt.length > 0
        ? parsed.firstRun.legalAcknowledgement
        : null,
      onboardingComplete: parsed.firstRun?.onboardingComplete === true,
      guideCompleted: parsed.firstRun?.guideCompleted === true,
      permissionNoticeAlarmId: typeof parsed.firstRun?.permissionNoticeAlarmId === 'string'
        ? parsed.firstRun.permissionNoticeAlarmId
        : null,
      preferences: {
        ...defaultOnboardingPreferences,
        ...parsed.firstRun?.preferences,
        displayName: typeof parsed.firstRun?.preferences?.displayName === 'string'
          ? parsed.firstRun.preferences.displayName.slice(0, 48)
          : '',
        useFor: parsed.firstRun?.preferences?.useFor === 'sleep' || parsed.firstRun?.preferences?.useFor === 'focus'
          ? parsed.firstRun.preferences.useFor
          : 'both',
        preferredMode: parsed.firstRun?.preferences?.preferredMode === 'bus-dropoff'
          || parsed.firstRun?.preferences?.preferredMode === 'place'
          ? parsed.firstRun.preferences.preferredMode
          : 'rail-station',
        preferredRailLineId: ['lrt-1', 'lrt-2', 'mrt-3'].includes(parsed.firstRun?.preferences?.preferredRailLineId ?? '')
          ? parsed.firstRun!.preferences!.preferredRailLineId
          : 'lrt-1',
      },
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
let stateOperationQueue: Promise<void> = Promise.resolve();

function serializeStateOperation<T>(operation: () => Promise<T>): Promise<T> {
  const pending = stateOperationQueue.then(operation, operation);
  stateOperationQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

async function openStateDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await withDatabaseRetry(() => database.execAsync(`
    PRAGMA busy_timeout = 1000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
      value TEXT NOT NULL
    );
  `));
  const row = await withDatabaseRetry(() => database.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_state WHERE id = ?',
    STATE_ROW_ID,
  ));
  if (!row) {
    // Read legacy storage before writing so it never holds a SQLite transaction open.
    const legacy = parseStoredValue(await AsyncStorage.getItem(STORAGE_KEY));
    await withDatabaseRetry(() => database.runAsync(
      'INSERT OR IGNORE INTO app_state (id, value) VALUES (?, ?)',
      STATE_ROW_ID,
      JSON.stringify(legacy),
    ));
  }
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
  const retryDelaysMs = [80, 160, 320, 640, 1000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const code = error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      const isDatabaseBusy = message.includes('database is locked') || message.includes('database is busy')
        || code === 5 || code === 'SQLITE_BUSY';
      const delay = retryDelaysMs[attempt];
      if (!isDatabaseBusy || delay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export function readAppState(): Promise<StoredAppState> {
  // Serialize reads too: Expo's transaction helper runs on this same connection,
  // so another query on it would otherwise join the in-flight transaction.
  return serializeStateOperation(async () => {
    const database = await getDatabase();
    const row = await withDatabaseRetry(() => database.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_state WHERE id = ?',
      STATE_ROW_ID,
    ));
    return parseStoredValue(row?.value ?? null);
  });
}

export function updateAppState(
  mutate: (current: StoredAppState) => StoredAppState,
  source: StateChangeSource = 'mutation',
): Promise<StoredAppState> {
  return serializeStateOperation(async () => {
    const database = await getDatabase();
    let updated: StoredAppState | null = null;
    let changed = false;
    let resetLiveLocation = false;
    await withDatabaseRetry(() => database.withTransactionAsync(async () => {
      const row = await database.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_state WHERE id = ?',
        STATE_ROW_ID,
      );
      const current = parseStoredValue(row?.value ?? null);
      const next = mutate(current);
      changed = next !== current;
      resetLiveLocation = source === 'mutation' && current.lastLocation !== null
        && next.lastLocation === null && next.lastLocationAt === null;
      // Duplicate/out-of-order location callbacks must not rewrite the state blob.
      if (next === current) {
        updated = current;
        return;
      }
      updated = normalizeAppState(next);
      await database.runAsync(
        'INSERT INTO app_state (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value',
        STATE_ROW_ID,
        JSON.stringify(updated),
      );
    }));
    if (!updated) throw new Error('Navo could not save the latest device state.');
    if (changed) {
      publishLiveLocation(updated, { reset: resetLiveLocation });
      publishAppStateChange(updated, source);
    }
    return updated;
  });
}
