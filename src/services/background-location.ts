import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Location as LocationSession } from 'expo-location/next';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { processLocationBatch } from '../domain/location-processing';
import { getLocationSamplingPolicy, type LocationSamplingPolicy } from '../domain/location-sampling';
import { hasValidCoordinates } from '../domain/location-quality';
import { buildMonitoringNotification } from '../domain/monitoring-notification';
import type { DestinationAlarmEvent, LocationFix, TripEvent } from '../domain/models';
import { getAlarmTone } from '../domain/alarm-tones';
import { readAppState, updateAppState, type StoredAppState } from './storage';
import { permissionHelpText, readAlarmPermissions, requestAlarmPermissions } from './alarm-permissions';
import { deliverAlarmNotification, dismissAlarmNotification } from './alarm-notification-delivery';
import { publishLiveLocation, setTrackingProblem } from '../state/live-location';

export const LOCATION_TASK_NAME = 'navo-trip-location-v1';
const RELAX_PROFILE_AFTER_MS = 60_000;
const MIN_NOTIFICATION_UPDATE_MS = 5_000;
let reconcileQueue: Promise<void> = Promise.resolve();
let relaxation: { key: string; since: number } | null = null;
let relaxationTimer: ReturnType<typeof setTimeout> | null = null;
let latestSpeedMps: number | null = null;
let progressNotification: { contentKey: string; statusKey: string; postedAt: number } | null = null;
let notificationFreshnessTimer: ReturnType<typeof setTimeout> | null = null;
let notificationExpiresAt: number | null = null;
const deliveries = new Map<string, Promise<void>>();

function clearRelaxation(): void {
  if (relaxationTimer !== null) clearTimeout(relaxationTimer);
  relaxationTimer = null;
  relaxation = null;
}

function clearNotificationFreshness(): void {
  if (notificationFreshnessTimer !== null) clearTimeout(notificationFreshnessTimer);
  notificationFreshnessTimer = null;
  notificationExpiresAt = null;
}

function scheduleNotificationFreshness(expiresAt: number | null): void {
  if (expiresAt !== null && expiresAt === notificationExpiresAt && notificationFreshnessTimer !== null) return;
  clearNotificationFreshness();
  if (expiresAt === null || expiresAt <= Date.now()) return;
  notificationExpiresAt = expiresAt;
  notificationFreshnessTimer = setTimeout(() => {
    notificationFreshnessTimer = null;
    notificationExpiresAt = null;
    void reconcileBackgroundLocation().catch(() => undefined);
  }, expiresAt - Date.now());
}

async function updateProgressNotification(state: StoredAppState, sessionRunning: boolean): Promise<void> {
  const now = Date.now();
  const content = buildMonitoringNotification(state, now);
  scheduleNotificationFreshness(content?.expiresAt ?? null);
  const title = content?.title ?? 'Navo location check is active';
  const body = content?.body ?? 'Waiting for a usable destination location.';
  const contentKey = `${title}\n${body}`;
  const statusKey = content?.statusKey ?? 'locating';
  const shouldUpdate = !sessionRunning || !progressNotification
    || progressNotification.statusKey !== statusKey
    || (progressNotification.contentKey !== contentKey && now - progressNotification.postedAt >= MIN_NOTIFICATION_UPDATE_MS);
  if (!shouldUpdate) return;
  try {
    // Updating the promoted session replaces its existing ongoing notification.
    // It does not schedule another notification, sound, or location watcher.
    await LocationSession.ensureBackgroundSessionStarted({
      notificationTitle: title, notificationBody: body,
      notificationColor: 0x0869A8, stopOnTaskRemoved: true,
    });
    progressNotification = { contentKey, statusKey, postedAt: now };
  } catch (error) {
    // A presentation update must not stop a working arrival detector. Retain the
    // old cache so the next usable wake retries; initial service startup must fail.
    if (!sessionRunning) throw error;
  }
}

function hasLocationWork(state: StoredAppState): boolean {
  const mappedTrip = state.activeTrip?.status === 'active' && state.activeRoute?.coordinateStatus === 'complete'
    && state.activeRoute.stops.every((stop) => stop.latitude !== undefined && stop.longitude !== undefined
      && hasValidCoordinates({ latitude: stop.latitude, longitude: stop.longitude }));
  return Boolean(mappedTrip || state.destinationAlarms.some((alarm) => alarm.enabled));
}

async function deliverEvent(item: TripEvent): Promise<void> {
  const title = item.type === 'destination-arrived' ? 'Your stop is here'
    : item.type === 'possible-wrong-direction' ? 'Check your direction'
      : item.type === 'route-deviation' ? 'Check your route'
        : item.type === 'approaching' ? 'Approaching stop' : 'Stop update';
  await Notifications.scheduleNotificationAsync({
    content: { title, body: item.message, sound: true, data: { eventId: item.id },
      ...(Platform.OS === 'android' ? { channelId: 'navo-trip' } : {}) },
    trigger: null,
  });
}

async function deliverDestinationAlarmEvent(event: DestinationAlarmEvent): Promise<void> {
  const state = await readAppState();
  const alarm = state.destinationAlarms.find((item) => item.id === event.alarmId);
  const destination = state.destinations.find((item) => item.id === event.destinationId);
  if (!alarm || !destination || alarm.sessionId !== event.sessionId || alarm.pendingEvent?.id !== event.id) return;
  const tone = getAlarmTone(alarm.ringtoneId, state.importedAlarmSounds);
  const notificationIdentifier = await deliverAlarmNotification(event, tone);
  const updated = await updateAppState((current) => {
    const currentAlarm = current.destinationAlarms.find((item) => item.id === event.alarmId);
    if (!currentAlarm || currentAlarm.sessionId !== event.sessionId || currentAlarm.pendingEvent?.id !== event.id) return current;
    return { ...current, destinationAlarms: current.destinationAlarms.map((item) => item.id === event.alarmId
      ? { ...item, pendingEvent: null, notificationIdentifier } : item) };
  });
  if (!updated.destinationAlarms.some((item) => item.id === event.alarmId
    && item.sessionId === event.sessionId && item.notificationIdentifier === notificationIdentifier)) {
    await dismissAlarmNotification(notificationIdentifier);
  }
}

function deliverOnce(event: DestinationAlarmEvent): Promise<void> {
  const existing = deliveries.get(event.id);
  if (existing) return existing;
  const delivery = deliverDestinationAlarmEvent(event).finally(() => { deliveries.delete(event.id); });
  deliveries.set(event.id, delivery);
  return delivery;
}

export async function deliverPendingDestinationAlarmEvents(): Promise<void> {
  const state = await readAppState();
  // Failed events remain durable; one failed delivery must not block another.
  await Promise.allSettled(state.destinationAlarms.flatMap((alarm) => alarm.pendingEvent ? [deliverOnce(alarm.pendingEvent)] : []));
}

function locationOptions(policy: LocationSamplingPolicy): Location.LocationTaskOptions {
  return {
    accuracy: policy.accuracy === 'high' ? Location.Accuracy.High : Location.Accuracy.Balanced,
    distanceInterval: policy.distanceInterval,
    ...(Platform.OS === 'android' ? { timeInterval: policy.timeInterval } : {}),
    pausesUpdatesAutomatically: policy.pausesUpdatesAutomatically,
    deferredUpdatesDistance: 0,
    deferredUpdatesInterval: 0,
    mayShowUserSettingsDialog: false,
    ...(Platform.OS === 'ios' ? { showsBackgroundLocationIndicator: true } : {}),
    // SDK 58's legacy foregroundService option forbids updating a task while
    // backgrounded. Android uses the independent Expo background session below.
  };
}

function optionsMatch(current: Record<string, unknown> | null, desired: Location.LocationTaskOptions): boolean {
  if (!current) return false;
  if (Platform.OS === 'android' && current.foregroundService) return false;
  return Object.entries(desired).every(([key, value]) => current[key] === value);
}

async function stopTracking(running: boolean): Promise<void> {
  clearRelaxation();
  clearNotificationFreshness();
  progressNotification = null;
  if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (Platform.OS === 'android') await LocationSession.stopBackgroundSession();
  latestSpeedMps = null;
}

async function reconcileTracking(): Promise<void> {
  let state = await readAppState();
  publishLiveLocation(state);
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (!hasLocationWork(state)) {
    await stopTracking(running);
    setTrackingProblem(null);
    return;
  }
  const permissions = await readAlarmPermissions();
  if (!permissions.ready) {
    await stopTracking(running);
    setTrackingProblem(permissionHelpText(permissions));
    return;
  }
  if (!await Location.hasServicesEnabledAsync()) {
    await stopTracking(running);
    setTrackingProblem('Location services are off. Turn on location in your phone settings.');
    return;
  }
  // Permissions/native calls can yield while a rider edits or deletes an alarm.
  state = await readAppState();
  if (!hasLocationWork(state)) {
    await stopTracking(running);
    setTrackingProblem(null);
    return;
  }
  if (Platform.OS === 'android') {
    const sessionRunning = LocationSession.getBackgroundSessionStatus().unthrottled;
    if (!sessionRunning && AppState.currentState !== 'active') {
      // Do not dismantle a pre-upgrade legacy service during a headless wake.
      setTrackingProblem('Open Navo to resume reliable background location checks.');
      return;
    }
    await updateProgressNotification(state, sessionRunning);
  }
  const policy = getLocationSamplingPolicy(state, Date.now(), latestSpeedMps);
  const desired = locationOptions(policy);
  const registeredOptions: unknown = running ? await TaskManager.getTaskOptionsAsync(LOCATION_TASK_NAME) : null;
  const current = registeredOptions && typeof registeredOptions === 'object'
    ? registeredOptions as Record<string, unknown> : null;
  if (running && optionsMatch(current, desired)) {
    clearRelaxation();
    setTrackingProblem(null);
    return;
  }
  const moreDemanding = !current || Boolean(current.foregroundService) || Number(current.accuracy) < Number(desired.accuracy)
    || Number(current.distanceInterval) > policy.distanceInterval
    || (Platform.OS === 'android' && Number(current.timeInterval) > policy.timeInterval)
    || (current.pausesUpdatesAutomatically === true && !policy.pausesUpdatesAutomatically);
  if (running && !moreDemanding && policy.profile !== 'departure') {
    const key = JSON.stringify(desired);
    const now = Date.now();
    if (relaxation?.key !== key) {
      clearRelaxation();
      relaxation = { key, since: now };
    }
    if (now - relaxation.since < RELAX_PROFILE_AFTER_MS) {
      if (relaxationTimer === null) relaxationTimer = setTimeout(() => {
        relaxationTimer = null;
        void reconcileBackgroundLocation().catch(() => undefined);
      }, RELAX_PROFILE_AFTER_MS - (now - relaxation.since));
      setTrackingProblem(null);
      return;
    }
  }
  // Keep one registered task; Android's independent session remains promoted
  // while Expo reapplies its GPS request. iOS changes the manager in place.
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, desired);
  clearRelaxation();
  setTrackingProblem(null);
}

/** Serializes native registration changes against the latest saved workload. */
export function reconcileBackgroundLocation(): Promise<void> {
  const next = reconcileQueue.then(reconcileTracking);
  reconcileQueue = next.catch(() => undefined);
  return next.catch((error: unknown) => {
    setTrackingProblem(error instanceof Error ? error.message : 'Location tracking is unavailable. Reopen Navo to try again.');
    throw error;
  });
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    const updated = await updateAppState((state) => state.locationProblem === error.message ? state : { ...state, locationProblem: error.message }, 'location');
    publishLiveLocation(updated);
    await deliverPendingDestinationAlarmEvents();
    await reconcileBackgroundLocation().catch(() => undefined);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  const fixes: LocationFix[] = locations.filter((location) => location?.coords).map((location) => ({
    latitude: location.coords.latitude, longitude: location.coords.longitude,
    accuracyM: location.coords.accuracy, timestamp: location.timestamp, speedMps: location.coords.speed,
  }));
  let tripEvents: TripEvent[] = [];
  const updated = fixes.length > 0 ? await updateAppState((state) => {
    const result = processLocationBatch(state, fixes, Date.now());
    tripEvents = result.tripEvents;
    return result.state;
  }, 'location') : await readAppState();
  const newest = fixes.find((fix) => fix.timestamp === updated.lastLocationAt);
  if (newest && Number.isFinite(newest.speedMps) && newest.speedMps! >= 0) latestSpeedMps = newest.speedMps!;
  publishLiveLocation(updated);
  await Promise.allSettled(tripEvents.map(deliverEvent));
  await deliverPendingDestinationAlarmEvents();
  await reconcileBackgroundLocation().catch(() => undefined);
});

export async function beginBackgroundLocation(_settings: { updateDistanceM: number; updateIntervalMs: number }): Promise<void> {
  const permissions = await requestAlarmPermissions();
  if (!permissions.ready) throw new Error(permissionHelpText(permissions));
  await reconcileBackgroundLocation();
}

export function stopBackgroundLocationIfIdle(): Promise<void> {
  return reconcileBackgroundLocation();
}

export function endBackgroundLocation(): Promise<void> {
  const next = reconcileQueue.then(async () => {
    await stopTracking(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME));
  });
  reconcileQueue = next.catch(() => undefined);
  return next;
}

export async function recordCurrentStop(): Promise<{ latitude: number; longitude: number }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Allow location while using Navo to save this stop.');
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: location.coords.latitude, longitude: location.coords.longitude };
}
