import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { evaluateLocationFix } from '../domain/trip-engine';
import { evaluateDestinationAlarmFix } from '../domain/destination-alarm';
import type { DestinationAlarmEvent, LocationFix, TripEvent } from '../domain/models';
import { readAppState, updateAppState } from './storage';
import { requestAlarmPermissions } from './alarm-permissions';

export const LOCATION_TASK_NAME = 'navo-trip-location-v1';

async function deliverEvent(item: TripEvent): Promise<void> {
  const isDestination = item.type === 'destination-arrived';
  const title = isDestination
    ? 'Your stop is here'
    : item.type === 'possible-wrong-direction'
      ? 'Check your direction'
      : item.type === 'route-deviation'
        ? 'Check your route'
        : item.type === 'approaching'
          ? 'Approaching stop'
          : 'Stop update';
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: item.message,
      sound: true,
      data: { eventId: item.id },
      ...(Platform.OS === 'android' ? { channelId: 'navo-trip' } : {}),
    },
    trigger: null,
  });
}

async function deliverDestinationAlarmEvent(event: DestinationAlarmEvent): Promise<void> {
  const state = await readAppState();
  const alarm = state.destinationAlarms.find((item) => item.id === event.alarmId);
  const destination = state.destinations.find((item) => item.id === event.destinationId);
  if (!alarm || !destination || alarm.sessionId !== event.sessionId || alarm.pendingEvent?.id !== event.id) return;

  const presented = await Notifications.getPresentedNotificationsAsync();
  const existing = presented.find((item) => item.request.content.data?.eventId === event.id);
  const notificationIdentifier = existing?.request.identifier ?? await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Your stop is near',
      body: event.message,
      sound: true,
      data: { eventId: event.id, destinationId: event.destinationId, destinationAlarmId: event.alarmId },
      ...(Platform.OS === 'android' ? { channelId: 'navo-trip' } : {}),
    },
    trigger: null,
  });

  const updated = await updateAppState((current) => {
    const currentAlarm = current.destinationAlarms.find((item) => item.id === event.alarmId);
    if (!currentAlarm || currentAlarm.sessionId !== event.sessionId || currentAlarm.pendingEvent?.id !== event.id) return current;
    return {
      ...current,
      destinationAlarms: current.destinationAlarms.map((item) => item.id === event.alarmId
        ? { ...item, pendingEvent: null, notificationIdentifier }
        : item),
    };
  });
  const stillBelongsToSession = updated.destinationAlarms.some((item) => item.id === event.alarmId
    && item.sessionId === event.sessionId
    && item.notificationIdentifier === notificationIdentifier);
  if (!stillBelongsToSession && !existing) {
    await Notifications.dismissNotificationAsync(notificationIdentifier);
  }
}

export async function deliverPendingDestinationAlarmEvents(): Promise<void> {
  const state = await readAppState();
  for (const alarm of state.destinationAlarms) {
    if (alarm.pendingEvent) await deliverDestinationAlarmEvent(alarm.pendingEvent);
  }
}

async function hasLocationWork(): Promise<boolean> {
  const state = await readAppState();
  return state.activeTrip?.status === 'active' || state.destinationAlarms.some((alarm) => alarm.enabled);
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    await updateAppState((state) => ({ ...state, locationProblem: error.message }));
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const location = locations?.[locations.length - 1];
  if (!location) return;

  const fix: LocationFix = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyM: location.coords.accuracy,
    timestamp: location.timestamp,
  };
  let tripEvents: TripEvent[] = [];
  let destinationEvents: DestinationAlarmEvent[] = [];
  await updateAppState((state) => {
    if (state.lastLocationAt !== null && fix.timestamp <= state.lastLocationAt) return state;
    const tripResult = state.activeTrip && state.activeRoute
      ? evaluateLocationFix(state.activeRoute, state.activeTrip, fix, state.settings.approachRadiusM)
      : null;
    tripEvents = tripResult?.events ?? [];
    destinationEvents = [];
    const nextAlarms = state.destinationAlarms.map((alarm) => {
      if (!alarm.enabled) return alarm;
      const destination = state.destinations.find((item) => item.id === alarm.destinationId);
      if (!destination) return { ...alarm, enabled: false, watchState: 'off' as const, sessionId: null };
      const evaluated = evaluateDestinationAlarmFix(destination, alarm, fix);
      if (evaluated.event) destinationEvents.push(evaluated.event);
      return evaluated.alarm;
    });
    const advice = tripEvents.find((item) => item.type === 'possible-wrong-direction' || item.type === 'route-deviation');
    return {
      ...state,
      activeTrip: tripResult?.trip ?? state.activeTrip,
      destinationAlarms: nextAlarms,
      lastLocationAt: fix.timestamp,
      lastLocation: { latitude: fix.latitude, longitude: fix.longitude },
      lastLocationAccuracyM: fix.accuracyM,
      lastTripNotice: destinationEvents[0]?.message ?? advice?.message ?? state.lastTripNotice,
      locationProblem: fix.accuracyM === null || fix.accuracyM > 80
        ? 'Waiting for a more accurate GPS fix. Keep Navo open if you need to confirm your progress.'
        : tripResult?.ignoredReason === 'unmapped-stop'
          ? 'A stop on this route has no location point. Use manual stop confirmation.'
          : null,
    };
  });

  for (const item of tripEvents) await deliverEvent(item);
  for (const item of destinationEvents) await deliverDestinationAlarmEvent(item);
  if (!await hasLocationWork() && await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
});

async function startLocationUpdates(settings: { updateDistanceM: number; updateIntervalMs: number }): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) return;
  const permissions = await requestAlarmPermissions();
  if (!permissions.notifications) throw new Error('Allow notifications to receive stop alerts. You can still track progress manually.');
  if (!permissions.foreground) throw new Error('Allow location while using Navo to start location tracking. You can still track progress manually.');
  if (!permissions.background) throw new Error('Background location is off. The trip can continue in manual mode, but Navo cannot check stops while closed.');

  const taskOptions: Location.LocationTaskOptions = {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: settings.updateIntervalMs,
    distanceInterval: settings.updateDistanceM,
    pausesUpdatesAutomatically: true,
    ...(Platform.OS === 'ios' ? { showsBackgroundLocationIndicator: true } : {}),
    ...(Platform.OS === 'android' ? {
      foregroundService: {
        notificationTitle: 'Navo location check is active',
        notificationBody: 'Navo checks your active destination alarm or route trip.',
        notificationColor: '#0869A8',
      },
    } : {}),
  };
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, taskOptions);
}

export async function beginBackgroundLocation(settings: { updateDistanceM: number; updateIntervalMs: number }): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) return;
  await startLocationUpdates(settings);
}

export async function endBackgroundLocation(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}

export async function stopBackgroundLocationIfIdle(): Promise<void> {
  if (!await hasLocationWork()) await endBackgroundLocation();
}

export async function recordCurrentStop(): Promise<{ latitude: number; longitude: number }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Allow location while using Navo to save this stop.');
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: location.coords.latitude, longitude: location.coords.longitude };
}
