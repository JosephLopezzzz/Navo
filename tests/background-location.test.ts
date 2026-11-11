import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DestinationAlarmEvent, SavedDestination } from '../src/domain/models';
import type { StoredAppState } from '../src/services/storage';
import { armDestinationAlarm, createDestinationAlarm } from '../src/domain/destination-alarm';

type TaskInput = { data?: { locations?: ReturnType<typeof location>[] }; error?: { message: string } | null };
const mocks = vi.hoisted(() => ({
  task: null as ((input: TaskInput) => Promise<unknown>) | null,
  state: null as StoredAppState | null,
  registered: false,
  appState: 'active',
  unthrottled: false,
  options: null as Record<string, unknown> | null,
  defineTask: vi.fn(), read: vi.fn(), update: vi.fn(),
  hasStarted: vi.fn(), start: vi.fn(), stop: vi.fn(), taskOptions: vi.fn(), servicesEnabled: vi.fn(),
  readPermissions: vi.fn(), requestPermissions: vi.fn(),
  sessionStatus: vi.fn(), ensureSession: vi.fn(), stopSession: vi.fn(),
  deliver: vi.fn(), dismiss: vi.fn(), schedule: vi.fn(), publish: vi.fn(), trackingProblem: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { get currentState() { return mocks.appState; } },
}));
vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4 },
  hasStartedLocationUpdatesAsync: mocks.hasStarted,
  startLocationUpdatesAsync: mocks.start,
  stopLocationUpdatesAsync: mocks.stop,
  hasServicesEnabledAsync: mocks.servicesEnabled,
}));
vi.mock('expo-location/next', () => ({
  Location: {
    getBackgroundSessionStatus: mocks.sessionStatus,
    ensureBackgroundSessionStarted: mocks.ensureSession,
    stopBackgroundSession: mocks.stopSession,
  },
}));
vi.mock('expo-task-manager', () => ({
  defineTask: mocks.defineTask,
  getTaskOptionsAsync: mocks.taskOptions,
}));
vi.mock('expo-notifications', () => ({ scheduleNotificationAsync: mocks.schedule }));
vi.mock('../src/services/storage', () => ({ readAppState: mocks.read, updateAppState: mocks.update }));
vi.mock('../src/services/alarm-permissions', () => ({
  readAlarmPermissions: mocks.readPermissions,
  requestAlarmPermissions: mocks.requestPermissions,
  permissionHelpText: () => 'Background location is off.',
}));
vi.mock('../src/state/live-location', () => ({ publishLiveLocation: mocks.publish, setTrackingProblem: mocks.trackingProblem }));
vi.mock('../src/services/alarm-notification-delivery', () => ({
  deliverAlarmNotification: mocks.deliver,
  dismissAlarmNotification: mocks.dismiss,
}));

const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const destination: SavedDestination = {
  id: 'destination-home', name: 'Home', kind: 'place', source: 'map-pin',
  latitude: 14.6, longitude: 121,
  createdAt: '2026-11-11T00:00:00.000Z', updatedAt: '2026-11-11T00:00:00.000Z',
};

function stateWithAlarm(): StoredAppState {
  return {
    schemaVersion: 5,
    activeTrip: null, activeRoute: null, customBusRoutes: [], importedAlarmSounds: [],
    destinations: [destination],
    destinationAlarms: [armDestinationAlarm(createDestinationAlarm('alarm-home', destination.id), 'session-home', NOW - 60_000)],
    settings: { approachRadiusM: 500, updateDistanceM: 75, updateIntervalMs: 20_000, sleepMode: true, appearance: 'light', locationNoticeDismissed: true },
    firstRun: {
      legalAcknowledgement: null, onboardingComplete: true, guideCompleted: true, permissionNoticeAlarmId: null,
      preferences: { displayName: '', useFor: 'both', preferredMode: 'bus-dropoff', preferredRailLineId: 'lrt-1' },
    },
    lastLocation: null, lastLocationAt: null, lastLocationAccuracyM: null, locationProblem: null, lastTripNotice: null,
  };
}

function location(distanceM: number, ageMs: number, accuracy = 10) {
  return {
    timestamp: NOW - ageMs,
    coords: { latitude: destination.latitude + distanceM / 111_195, longitude: destination.longitude, accuracy, speed: 8, altitude: null, altitudeAccuracy: null, heading: null },
  };
}

function addPendingEvent(alarmId = 'alarm-home', destinationId = destination.id): DestinationAlarmEvent {
  const event = { id: `event-${alarmId}`, alarmId, destinationId, sessionId: 'session-home', message: `You are near ${destinationId}.` };
  const current = mocks.state!;
  current.destinationAlarms = current.destinationAlarms.map((alarm) => alarm.id === alarmId
    ? { ...alarm, enabled: false, watchState: 'alerted', pendingEvent: event }
    : alarm);
  return event;
}

function addRouteTrip(mapped: boolean): void {
  mocks.state!.activeTrip = {
    id: 'route-trip', routeId: 'route', boardingIndex: 0, destinationIndex: 1, lastConfirmedIndex: 0,
    alertMode: 'destination-only', startedAt: new Date(NOW - 30_000).toISOString(), status: 'active',
    approachedStopIds: [], arrivedStopIds: [], movingAwayCount: 0, directionAdvisorySent: false,
    offRouteCount: 0, routeDeviationSent: false,
  };
  mocks.state!.activeRoute = {
    id: 'route', name: mapped ? 'Bus' : 'Rail', mode: mapped ? 'bus' : 'rail', direction: 'North', dataQuality: mapped ? 'user-authored' : 'preview',
    coordinateStatus: mapped ? 'complete' : 'missing', sourceLabel: mapped ? 'Rider saved' : 'Station order only',
    stops: mapped
      ? [{ id: 'start', name: 'Start', latitude: 14.7, longitude: 121 }, { id: 'end', name: 'End', latitude: 14.6, longitude: 121 }]
      : [{ id: 'start', name: 'Start' }, { id: 'end', name: 'End' }],
  };
}

async function loadService() {
  return import('../src/services/background-location');
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(NOW);
  mocks.state = stateWithAlarm();
  mocks.registered = false;
  mocks.appState = 'active';
  mocks.unthrottled = false;
  mocks.options = null;
  mocks.task = null;
  mocks.defineTask.mockImplementation((_name, task) => { mocks.task = task; });
  mocks.read.mockImplementation(async () => mocks.state!);
  mocks.update.mockImplementation(async (mutate: (state: StoredAppState) => StoredAppState) => {
    mocks.state = mutate(mocks.state!);
    return mocks.state;
  });
  mocks.hasStarted.mockImplementation(async () => mocks.registered);
  mocks.start.mockImplementation(async (_name, options) => { mocks.registered = true; mocks.options = options; });
  mocks.stop.mockImplementation(async () => { mocks.registered = false; mocks.options = null; });
  mocks.taskOptions.mockImplementation(async () => mocks.options);
  mocks.servicesEnabled.mockResolvedValue(true);
  mocks.sessionStatus.mockImplementation(() => ({ unthrottled: mocks.unthrottled }));
  mocks.ensureSession.mockImplementation(async () => { mocks.unthrottled = true; });
  mocks.stopSession.mockImplementation(async () => { mocks.unthrottled = false; });
  mocks.readPermissions.mockResolvedValue({ notifications: true, foreground: true, background: true, ready: true });
  mocks.requestPermissions.mockResolvedValue({ notifications: true, foreground: true, background: true, ready: true });
  mocks.deliver.mockResolvedValue('posted-notification');
  mocks.dismiss.mockResolvedValue(undefined);
  mocks.schedule.mockResolvedValue('trip-notification');
});

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('shared background distance tracking', () => {
  it('processes every chronological sample in a batch so an intermediate arrival is not lost', async () => {
    await loadService();
    expect(mocks.task).not.toBeNull();

    await mocks.task!({ data: { locations: [location(900, 1_000), location(800, 4_000), location(300, 2_000), location(400, 3_000)] } });

    const alarm = mocks.state!.destinationAlarms[0];
    expect(alarm.watchState).toBe('alerted');
    expect(alarm.enabled).toBe(false);
    expect(alarm.pendingEvent).toBeNull();
    expect(alarm.notificationIdentifier).toBe('posted-notification');
    expect(mocks.deliver).toHaveBeenCalledOnce();
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ lastLocationAt: NOW - 1_000 }));
  });

  it('does not let an inaccurate reading replace the last usable shared location', async () => {
    await loadService();
    const usable = location(2_000, 2_000);
    await mocks.task!({ data: { locations: [usable] } });
    const knownPosition = mocks.state!.lastLocation;
    const knownAt = mocks.state!.lastLocationAt;

    await mocks.task!({ data: { locations: [location(0, 1_000, 500)] } });

    expect(mocks.state!.lastLocation).toEqual(knownPosition);
    expect(mocks.state!.lastLocationAt).toBe(knownAt);
    expect(mocks.state!.destinationAlarms[0].enabled).toBe(true);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it('leaves a failed notification pending and retries it on a later task wake', async () => {
    const event = addPendingEvent();
    mocks.deliver.mockRejectedValueOnce(new Error('Notification unavailable'));
    await loadService();

    await mocks.task!({ data: { locations: [location(1_000, 2_000)] } });
    expect(mocks.state!.destinationAlarms[0].pendingEvent).toEqual(event);

    await mocks.task!({ data: { locations: [location(900, 1_000)] } });
    expect(mocks.deliver).toHaveBeenCalledTimes(2);
    expect(mocks.state!.destinationAlarms[0].pendingEvent).toBeNull();
    expect(mocks.state!.destinationAlarms[0].notificationIdentifier).toBe('posted-notification');
  });

  it('does not let one failed pending alert prevent another alarm from being delivered', async () => {
    mocks.state!.destinations.push({ ...destination, id: 'destination-work', name: 'Work' });
    mocks.state!.destinationAlarms.push(armDestinationAlarm(createDestinationAlarm('alarm-work', 'destination-work'), 'session-home', NOW - 60_000));
    const first = addPendingEvent();
    addPendingEvent('alarm-work', 'destination-work');
    mocks.deliver.mockRejectedValueOnce(new Error('First alert failed'));
    const service = await loadService();

    await service.deliverPendingDestinationAlarmEvents();

    expect(mocks.deliver).toHaveBeenCalledTimes(2);
    expect(mocks.state!.destinationAlarms[0].pendingEvent).toEqual(first);
    expect(mocks.state!.destinationAlarms[1].pendingEvent).toBeNull();
  });

  it('deduplicates concurrent pending-delivery attempts for the same session event', async () => {
    addPendingEvent();
    let finishDelivery!: (identifier: string) => void;
    mocks.deliver.mockImplementationOnce(() => new Promise<string>((resolve) => { finishDelivery = resolve; }));
    const service = await loadService();
    const first = service.deliverPendingDestinationAlarmEvents();
    const second = service.deliverPendingDestinationAlarmEvents();
    await vi.waitFor(() => expect(mocks.deliver).toHaveBeenCalledOnce());
    finishDelivery('posted-once');
    await Promise.all([first, second]);

    expect(mocks.deliver).toHaveBeenCalledOnce();
    expect(mocks.state!.destinationAlarms[0].notificationIdentifier).toBe('posted-once');
  });

  it('dismisses an alert posted while its destination is deleted instead of attaching it to another session', async () => {
    addPendingEvent();
    mocks.deliver.mockImplementationOnce(async () => {
      mocks.state = { ...mocks.state!, destinations: [], destinationAlarms: [] };
      return 'orphaned-notification';
    });
    const service = await loadService();

    await service.deliverPendingDestinationAlarmEvents();

    expect(mocks.dismiss).toHaveBeenCalledWith('orphaned-notification');
    expect(mocks.state!.destinationAlarms).toEqual([]);
  });

  it('does not register GPS for an idle app and stops an obsolete registration', async () => {
    mocks.state!.destinationAlarms = [];
    const service = await loadService();
    await service.reconcileBackgroundLocation();
    expect(mocks.start).not.toHaveBeenCalled();

    mocks.registered = true;
    await service.reconcileBackgroundLocation();
    expect(mocks.stop).toHaveBeenCalledWith(service.LOCATION_TASK_NAME);
  });

  it('reconciles without prompting and avoids duplicate registration when options are unchanged', async () => {
    const service = await loadService();

    await Promise.all([service.reconcileBackgroundLocation(), service.reconcileBackgroundLocation()]);

    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.ensureSession).toHaveBeenCalledOnce();
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.readPermissions).toHaveBeenCalled();
  });

  it('does not register tracking without background access or re-request revoked permissions', async () => {
    mocks.readPermissions.mockResolvedValue({ notifications: true, foreground: true, background: false, ready: false });
    mocks.registered = true;
    const service = await loadService();

    await service.reconcileBackgroundLocation();

    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalledWith(service.LOCATION_TASK_NAME);
    expect(mocks.stopSession).toHaveBeenCalled();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.trackingProblem).toHaveBeenCalledWith(expect.any(String));
  });

  it('changes sampling options on the existing task without stopping location updates first', async () => {
    mocks.registered = true;
    mocks.options = { accuracy: 3, timeInterval: 30_000, distanceInterval: 150, pausesUpdatesAutomatically: true };
    const service = await loadService();

    await service.reconcileBackgroundLocation();

    expect(mocks.start).toHaveBeenCalledWith(service.LOCATION_TASK_NAME, expect.objectContaining({ accuracy: 4 }));
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it('requests permissions only for an explicit start and reports denied background access', async () => {
    mocks.requestPermissions.mockResolvedValue({ notifications: true, foreground: true, background: false, ready: false });
    const service = await loadService();

    await expect(service.beginBackgroundLocation(mocks.state!.settings)).rejects.toThrow(/background/i);

    expect(mocks.requestPermissions).toHaveBeenCalledOnce();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('keeps tracking after the last saved alarm is removed if a route trip remains active', async () => {
    mocks.state!.destinationAlarms = [];
    addRouteTrip(true);
    mocks.registered = true;
    const service = await loadService();

    await service.stopBackgroundLocationIfIdle();

    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it('does not start GPS for a manual rail trip whose station coordinates are missing', async () => {
    mocks.state!.destinationAlarms = [];
    addRouteTrip(false);
    const service = await loadService();

    await service.reconcileBackgroundLocation();

    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
  });

  it('updates the existing legacy task while backgrounded without restarting a foreground service', async () => {
    const service = await loadService();
    await service.reconcileBackgroundLocation();
    expect(mocks.ensureSession).toHaveBeenCalledOnce();
    mocks.appState = 'background';
    const near = location(1_000, 0);
    mocks.state = {
      ...mocks.state!,
      lastLocation: { latitude: near.coords.latitude, longitude: near.coords.longitude },
      lastLocationAt: NOW,
      lastLocationAccuracyM: 10,
    };

    await service.reconcileBackgroundLocation();

    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.start).toHaveBeenLastCalledWith(service.LOCATION_TASK_NAME, expect.objectContaining({ accuracy: 4, timeInterval: 2_000 }));
    for (const [, options] of mocks.start.mock.calls) expect(options).not.toHaveProperty('foregroundService');
    expect(mocks.ensureSession).toHaveBeenCalledOnce();
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.stopSession).not.toHaveBeenCalled();
  });

  it.each([false, true])('does not start a foreground session from the background when its session is missing (task running: %s)', async (running) => {
    mocks.appState = 'background';
    mocks.registered = running;
    const service = await loadService();

    await service.reconcileBackgroundLocation();

    expect(mocks.ensureSession).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.trackingProblem).toHaveBeenCalledWith(expect.any(String));
    expect(mocks.registered).toBe(running);
  });

  it('releases both task updates and the background session when all location work ends', async () => {
    const service = await loadService();
    await service.reconcileBackgroundLocation();
    expect(mocks.registered).toBe(true);
    expect(mocks.unthrottled).toBe(true);
    mocks.state = { ...mocks.state!, destinationAlarms: [] };

    await service.stopBackgroundLocationIfIdle();

    expect(mocks.stop).toHaveBeenCalledWith(service.LOCATION_TASK_NAME);
    expect(mocks.stopSession).toHaveBeenCalled();
    expect(mocks.registered).toBe(false);
    expect(mocks.unthrottled).toBe(false);
  });

  it('holds a lower-power profile for a minute and reapplies it from the background timer', async () => {
    const service = await loadService();
    await service.reconcileBackgroundLocation();
    const far = location(10_000, 0);
    mocks.state = {
      ...mocks.state!,
      lastLocation: { latitude: far.coords.latitude, longitude: far.coords.longitude },
      lastLocationAt: NOW,
      lastLocationAccuracyM: 10,
    };
    mocks.appState = 'background';
    await service.reconcileBackgroundLocation();
    expect(mocks.start).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(59_999);
    expect(mocks.start).toHaveBeenCalledOnce();
    // The last high-frequency update is fresh when the timer checks the workload.
    mocks.state.lastLocationAt = Date.now();
    await vi.advanceTimersByTimeAsync(1);
    await service.reconcileBackgroundLocation();

    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.start).toHaveBeenLastCalledWith(service.LOCATION_TASK_NAME, expect.objectContaining({ accuracy: 3, timeInterval: 20_000, distanceInterval: 75 }));
    expect(mocks.ensureSession).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a pending profile timer when the final alarm is disabled', async () => {
    const service = await loadService();
    await service.reconcileBackgroundLocation();
    const far = location(10_000, 0);
    mocks.state = {
      ...mocks.state!,
      lastLocation: { latitude: far.coords.latitude, longitude: far.coords.longitude },
      lastLocationAt: NOW,
      lastLocationAccuracyM: 10,
    };
    await service.reconcileBackgroundLocation();
    expect(vi.getTimerCount()).toBe(1);
    mocks.state.destinationAlarms = [];

    await service.stopBackgroundLocationIfIdle();
    await vi.advanceTimersByTimeAsync(61_000);

    expect(vi.getTimerCount()).toBe(0);
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.registered).toBe(false);
    expect(mocks.unthrottled).toBe(false);
  });

  it('immediately reduces sampling while an alarm is waiting for departure from inside its destination area', async () => {
    const service = await loadService();
    await service.reconcileBackgroundLocation();
    const home = location(100, 0);
    mocks.state = {
      ...mocks.state!,
      lastLocation: { latitude: home.coords.latitude, longitude: home.coords.longitude },
      lastLocationAt: NOW,
      lastLocationAccuracyM: 10,
    };

    await service.reconcileBackgroundLocation();

    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.start).toHaveBeenLastCalledWith(service.LOCATION_TASK_NAME, expect.objectContaining({ accuracy: 3, timeInterval: 10_000, distanceInterval: 25 }));
    expect(vi.getTimerCount()).toBe(0);
    expect(mocks.state.destinationAlarms[0].watchState).toBe('awaiting-exit');
  });

  it('requests a stationary confirmation sample after one nearby reading and then delivers the arrival alert', async () => {
    mocks.state!.destinationAlarms[0].watchState = 'monitoring';
    await loadService();

    await mocks.task!({ data: { locations: [location(300, 1_000)] } });

    expect(mocks.start).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ accuracy: 4, timeInterval: 2_000, distanceInterval: 0 }));
    expect(mocks.state!.destinationAlarms[0].consecutiveInsideFixes).toBe(1);
    expect(mocks.deliver).not.toHaveBeenCalled();

    await mocks.task!({ data: { locations: [location(300, 0)] } });

    expect(mocks.state!.destinationAlarms[0].watchState).toBe('alerted');
    expect(mocks.deliver).toHaveBeenCalledOnce();
    expect(mocks.registered).toBe(false);
    expect(mocks.unthrottled).toBe(false);
  });

  it('stops tracking when phone location services are switched off and restores it after services return', async () => {
    const service = await loadService();
    await service.reconcileBackgroundLocation();
    expect(mocks.registered).toBe(true);
    expect(mocks.unthrottled).toBe(true);
    mocks.servicesEnabled.mockResolvedValue(false);

    await service.reconcileBackgroundLocation();

    expect(mocks.registered).toBe(false);
    expect(mocks.unthrottled).toBe(false);
    expect(mocks.trackingProblem).toHaveBeenLastCalledWith(expect.stringMatching(/location services.*off/i));
    expect(mocks.state!.destinationAlarms[0].enabled).toBe(true);
    mocks.servicesEnabled.mockResolvedValue(true);

    await service.reconcileBackgroundLocation();

    expect(mocks.registered).toBe(true);
    expect(mocks.unthrottled).toBe(true);
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.ensureSession).toHaveBeenCalledTimes(2);
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
  });
});
