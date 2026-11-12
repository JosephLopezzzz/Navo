import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { armDestinationAlarm, createDestinationAlarm, disarmDestinationAlarm } from '../src/domain/destination-alarm';
import type { StoredAppState } from '../src/services/storage';
import { buildBusRoute, upsertBusRoute } from '../src/domain/bus-routes';
import { confirmTripStop, startTripState } from '../src/domain/trip-actions';
import { makeJourneyRoute, railLines } from '../src/data/routes';

const sqlite = vi.hoisted(() => ({
  raw: null as string | null,
  staged: null as string | null,
  inTransaction: false,
  failCommit: false,
  open: vi.fn(), exec: vi.fn(), getRow: vi.fn(), run: vi.fn(), transaction: vi.fn(), legacy: vi.fn(),
}));

vi.mock('expo-sqlite', () => ({ openDatabaseAsync: sqlite.open }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: sqlite.legacy } }));

const NOW = Date.parse('2026-11-11T12:00:00.000Z');

async function loadStateModules() {
  const storage = await import('../src/services/storage');
  const live = await import('../src/state/live-location');
  const events = await import('../src/state/app-state-events');
  return { ...storage, live, events };
}

function savedState(defaults: StoredAppState): StoredAppState {
  return {
    ...structuredClone(defaults),
    destinations: [{
      id: 'home', name: 'Home', kind: 'place', source: 'map-pin', latitude: 14.6, longitude: 121,
      createdAt: '2026-11-11T00:00:00.000Z', updatedAt: '2026-11-11T00:00:00.000Z',
    }],
    destinationAlarms: [armDestinationAlarm(createDestinationAlarm('home-alarm', 'home'), 'home-session', NOW - 60_000)],
  };
}

function withLocation(state: StoredAppState, ageMs = 1_000): StoredAppState {
  return {
    ...state,
    lastLocation: { latitude: 14.61, longitude: 121.01 },
    lastLocationAt: NOW - ageMs,
    lastLocationAccuracyM: 10,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  sqlite.raw = null;
  sqlite.staged = null;
  sqlite.inTransaction = false;
  sqlite.failCommit = false;
  sqlite.exec.mockResolvedValue(undefined);
  sqlite.legacy.mockResolvedValue(null);
  sqlite.getRow.mockImplementation(async () => {
    const value = sqlite.inTransaction ? sqlite.staged : sqlite.raw;
    return value === null ? null : { value };
  });
  sqlite.run.mockImplementation(async (_sql: string, _id: number, value: string) => {
    if (sqlite.inTransaction) sqlite.staged = value;
    else if (sqlite.raw === null) sqlite.raw = value;
    return { changes: 1 };
  });
  sqlite.transaction.mockImplementation(async (work: () => Promise<void>) => {
    sqlite.inTransaction = true;
    sqlite.staged = sqlite.raw;
    try {
      await work();
      if (sqlite.failCommit) throw new Error('Commit failed');
      sqlite.raw = sqlite.staged;
    } finally {
      sqlite.inTransaction = false;
      sqlite.staged = null;
    }
  });
  sqlite.open.mockResolvedValue({ execAsync: sqlite.exec, getFirstAsync: sqlite.getRow, runAsync: sqlite.run, withTransactionAsync: sqlite.transaction });
});

afterEach(() => { vi.useRealTimers(); });

describe('persisted route workflows', () => {
  it('serializes route appends and keeps a failed edit retryable without duplicate routes', async () => {
    const modules = await loadStateModules();
    const initial = savedState(modules.defaultAppState);
    sqlite.raw = JSON.stringify(initial);
    const stops = [{ id: 'a', name: 'Boarding' }, { id: 'b', name: 'Destination' }];
    const first = buildBusRoute('bus-first', 'First route', stops);
    const second = buildBusRoute('bus-second', 'Second route', stops);
    await Promise.all([
      modules.updateAppState((current) => upsertBusRoute(current, first, null)),
      modules.updateAppState((current) => upsertBusRoute(current, second, null)),
    ]);
    expect((await modules.readAppState()).customBusRoutes.map((route) => route.id)).toEqual(['bus-first', 'bus-second']);

    const edited = buildBusRoute(first.id, 'Edited route', [...stops].reverse());
    sqlite.failCommit = true;
    await expect(modules.updateAppState((current) => upsertBusRoute(current, edited, first))).rejects.toThrow('Commit failed');
    expect((await modules.readAppState()).customBusRoutes[0]?.name).toBe('First route');
    sqlite.failCommit = false;
    await modules.updateAppState((current) => upsertBusRoute(current, edited, first));
    await modules.updateAppState((current) => upsertBusRoute(current, edited, first));
    const persisted = await modules.readAppState();
    expect(persisted.customBusRoutes).toEqual([edited, second]);
    expect(persisted.destinationAlarms).toEqual(initial.destinationAlarms);
  });

  it('persists one advance for simultaneous confirmations of the same rendered stop', async () => {
    const modules = await loadStateModules();
    const initial = savedState(modules.defaultAppState);
    const journey = makeJourneyRoute(railLines[0]!, 0, 2)!;
    const trip = {
      id: 'manual-trip', routeId: journey.id, boardingIndex: 0, destinationIndex: 2,
      lastConfirmedIndex: 0, alertMode: 'destination-only' as const,
      startedAt: new Date(NOW).toISOString(), status: 'active' as const,
      approachedStopIds: [], arrivedStopIds: [], movingAwayCount: 0,
      directionAdvisorySent: false, offRouteCount: 0, routeDeviationSent: false,
    };
    sqlite.raw = JSON.stringify(initial);
    await modules.updateAppState((current) => startTripState(current, journey, trip, null));
    await Promise.all([
      modules.updateAppState((current) => confirmTripStop(current, trip.id, 0).state),
      modules.updateAppState((current) => confirmTripStop(current, trip.id, 0).state),
    ]);
    const persisted = await modules.readAppState();
    expect(persisted.activeTrip?.lastConfirmedIndex).toBe(1);
    expect(persisted.activeTrip?.arrivedStopIds).toEqual([journey.stops[1]!.id]);
    expect(persisted.activeRoute?.coordinateStatus).toBe('missing');
    expect(persisted.destinationAlarms).toEqual(initial.destinationAlarms);
  });
});

describe('location state persistence and subscriptions', () => {
  it('does not issue an INSERT for a duplicate or out-of-order no-op reducer', async () => {
    const modules = await loadStateModules();
    const current = savedState(modules.defaultAppState);
    sqlite.raw = JSON.stringify(current);

    const result = await modules.updateAppState((state) => state, 'location');

    expect(sqlite.run).not.toHaveBeenCalled();
    expect(result).toEqual(current);
    expect(JSON.parse(sqlite.raw!)).toEqual(current);
  });

  it('publishes the persisted location and state change only after the transaction commits', async () => {
    const modules = await loadStateModules();
    const current = savedState(modules.defaultAppState);
    sqlite.raw = JSON.stringify(current);
    const stateObserver = vi.fn((_state: StoredAppState, _source: string) => {
      expect(sqlite.inTransaction).toBe(false);
      expect(JSON.parse(sqlite.raw!).lastLocationAt).toBe(NOW - 1_000);
    });
    const liveObserver = vi.fn(() => {
      expect(sqlite.inTransaction).toBe(false);
      expect(JSON.parse(sqlite.raw!).lastLocationAt).toBe(NOW - 1_000);
    });
    modules.events.subscribeToAppStateChanges(stateObserver);
    modules.live.subscribeToLiveLocation(liveObserver);

    const result = await modules.updateAppState((state) => withLocation(state), 'location');

    expect(sqlite.run).toHaveBeenCalledOnce();
    expect(stateObserver).toHaveBeenCalledWith(result, 'location');
    expect(liveObserver).toHaveBeenCalledOnce();
    expect(modules.live.getLiveLocation()).toMatchObject({ location: result.lastLocation, locationAt: NOW - 1_000, accuracyM: 10 });
  });

  it('does not publish an uncommitted state when SQLite rolls back a transaction', async () => {
    const modules = await loadStateModules();
    const current = savedState(modules.defaultAppState);
    sqlite.raw = JSON.stringify(current);
    await modules.readAppState();
    sqlite.failCommit = true;
    const stateObserver = vi.fn();
    const liveObserver = vi.fn();
    modules.events.subscribeToAppStateChanges(stateObserver);
    modules.live.subscribeToLiveLocation(liveObserver);

    await expect(modules.updateAppState((state) => withLocation(state), 'location')).rejects.toThrow('Commit failed');

    expect(JSON.parse(sqlite.raw!)).toEqual(current);
    expect(stateObserver).not.toHaveBeenCalled();
    expect(liveObserver).not.toHaveBeenCalled();
    expect(modules.live.getLiveLocation().location).toBeNull();
  });

  it('isolates throwing UI observers from committed storage and other observers', async () => {
    const modules = await loadStateModules();
    sqlite.raw = JSON.stringify(savedState(modules.defaultAppState));
    const stateObserver = vi.fn();
    const liveObserver = vi.fn();
    modules.events.subscribeToAppStateChanges(() => { throw new Error('State screen unmounted'); });
    modules.events.subscribeToAppStateChanges(stateObserver);
    modules.live.subscribeToLiveLocation(() => { throw new Error('Location screen unmounted'); });
    modules.live.subscribeToLiveLocation(liveObserver);

    const result = await modules.updateAppState((state) => withLocation(state), 'location');

    expect(JSON.parse(sqlite.raw!).lastLocationAt).toBe(result.lastLocationAt);
    expect(stateObserver).toHaveBeenCalledWith(result, 'location');
    expect(liveObserver).toHaveBeenCalledOnce();
    expect(modules.live.getLiveLocation().locationAt).toBe(result.lastLocationAt);
  });

  it('keeps the visible app signature stable when only distance telemetry changes', async () => {
    const modules = await loadStateModules();
    const current = savedState(modules.defaultAppState);
    const telemetry = withLocation({
      ...current,
      destinationAlarms: current.destinationAlarms.map((alarm) => ({ ...alarm, lastDistanceM: 1_500, lastFixAt: NOW - 1_000, consecutiveInsideFixes: 1 })),
    });

    expect(modules.events.visibleAppStateSignature(telemetry)).toBe(modules.events.visibleAppStateSignature(current));
  });

  it('changes the visible app signature for alarm lifecycle, deletion, and permission problems', async () => {
    const modules = await loadStateModules();
    const current = savedState(modules.defaultAppState);
    const signature = modules.events.visibleAppStateSignature(current);
    const off = { ...current, destinationAlarms: current.destinationAlarms.map(disarmDestinationAlarm) };
    const onAgain = { ...off, destinationAlarms: off.destinationAlarms.map((alarm) => armDestinationAlarm(alarm, 'new-session', NOW)) };
    const arrived: StoredAppState = {
      ...current,
      destinationAlarms: current.destinationAlarms.map((alarm) => ({ ...alarm, enabled: false, watchState: 'alerted', firedAt: NOW })),
    };
    const deleted = { ...current, destinationAlarms: [], destinations: [] };
    const notice = { ...current, firstRun: { ...current.firstRun, permissionNoticeAlarmId: 'home-alarm' } };
    const problem = { ...current, locationProblem: 'Background location access is off.' };

    for (const changed of [off, onAgain, arrived, deleted, notice, problem]) {
      expect(modules.events.visibleAppStateSignature(changed)).not.toBe(signature);
    }
    expect(modules.events.visibleAppStateSignature(onAgain)).not.toBe(modules.events.visibleAppStateSignature(off));
  });

  it.each([
    { name: 'invalid coordinates', patch: { lastLocation: { latitude: NaN, longitude: 121 } } },
    { name: 'future timestamp', patch: { lastLocationAt: NOW + 60_000 } },
    { name: 'negative accuracy', patch: { lastLocationAccuracyM: -1 } },
    { name: 'weak GPS', patch: { lastLocationAccuracyM: 500 } },
  ])('retains the last good live position after a snapshot with $name', async ({ patch }) => {
    const modules = await loadStateModules();
    const accepted = withLocation(savedState(modules.defaultAppState));
    modules.live.publishLiveLocation(accepted);
    const previous = modules.live.getLiveLocation();

    modules.live.publishLiveLocation({ ...accepted, ...patch });

    expect(modules.live.getLiveLocation().location).toEqual(previous.location);
    expect(modules.live.getLiveLocation().locationAt).toBe(previous.locationAt);
    expect(modules.live.getLiveLocation().accuracyM).toBe(previous.accuracyM);
  });

  it('does not regress the live position when a delayed older storage snapshot arrives', async () => {
    const modules = await loadStateModules();
    const accepted = withLocation(savedState(modules.defaultAppState));
    modules.live.publishLiveLocation(accepted);

    modules.live.publishLiveLocation({ ...accepted, lastLocation: { latitude: 14.7, longitude: 121.1 }, lastLocationAt: NOW - 30_000 });

    expect(modules.live.getLiveLocation().locationAt).toBe(accepted.lastLocationAt);
    expect(modules.live.getLiveLocation().location).toEqual(accepted.lastLocation);
  });

  it('retains an accepted position during an empty hydration but clears it after an explicit committed reset', async () => {
    const modules = await loadStateModules();
    const current = savedState(modules.defaultAppState);
    const accepted = withLocation(current);
    sqlite.raw = JSON.stringify(accepted);
    await modules.readAppState();
    modules.live.publishLiveLocation(accepted);
    modules.live.publishLiveLocation(current);
    expect(modules.live.getLiveLocation().locationAt).toBe(accepted.lastLocationAt);

    const clear = (state: StoredAppState): StoredAppState => ({ ...state, lastLocation: null, lastLocationAt: null, lastLocationAccuracyM: null });
    sqlite.failCommit = true;
    await expect(modules.updateAppState(clear)).rejects.toThrow('Commit failed');
    expect(modules.live.getLiveLocation().locationAt).toBe(accepted.lastLocationAt);

    sqlite.failCommit = false;
    await modules.updateAppState(clear);
    expect(modules.live.getLiveLocation()).toMatchObject({ location: null, locationAt: null, accuracyM: null });
    expect(JSON.parse(sqlite.raw!).lastLocation).toBeNull();
  });

  it('keeps route-coordinate warnings on app state without marking a valid saved-alarm GPS reading as weak', async () => {
    const modules = await loadStateModules();
    const { UNMAPPED_ROUTE_PROBLEM } = await import('../src/domain/location-processing');
    const current = withLocation(savedState(modules.defaultAppState));
    sqlite.raw = JSON.stringify(current);

    const updated = await modules.updateAppState((state) => ({ ...state, locationProblem: UNMAPPED_ROUTE_PROBLEM }), 'location');

    expect(updated.locationProblem).toBe(UNMAPPED_ROUTE_PROBLEM);
    expect(modules.live.getLiveLocation()).toMatchObject({ locationAt: current.lastLocationAt, problem: null });
    modules.live.publishLiveLocation({ ...updated, locationProblem: 'GPS is weak.' });
    expect(modules.live.getLiveLocation().problem).toBe('GPS is weak.');
  });

  it('notifies live subscribers only when a reading or status actually changes', async () => {
    const modules = await loadStateModules();
    const accepted = withLocation(savedState(modules.defaultAppState));
    const observer = vi.fn();
    const unsubscribe = modules.live.subscribeToLiveLocation(observer);
    modules.live.publishLiveLocation(accepted);
    const firstSnapshot = modules.live.getLiveLocation();

    modules.live.publishLiveLocation({ ...accepted, lastLocation: { ...accepted.lastLocation! } });
    modules.live.setTrackingProblem(null);
    expect(observer).toHaveBeenCalledOnce();
    expect(modules.live.getLiveLocation()).toBe(firstSnapshot);

    modules.live.setTrackingProblem('Background location is off.');
    expect(observer).toHaveBeenCalledTimes(2);
    unsubscribe();
    modules.live.setTrackingProblem(null);
    expect(observer).toHaveBeenCalledTimes(2);
  });
});
