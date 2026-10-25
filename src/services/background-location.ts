import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { evaluateLocationFix } from '../domain/trip-engine';
import type { LocationFix, TripEvent } from '../domain/models';
import { readAppState, writeAppState } from './storage';

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

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  const state = await readAppState();
  if (error) {
    await writeAppState({ ...state, locationProblem: error.message });
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const location = locations?.[locations.length - 1];
  if (!location || !state.activeTrip || !state.activeRoute) return;

  const fix: LocationFix = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyM: location.coords.accuracy,
    timestamp: location.timestamp,
  };
  const result = evaluateLocationFix(state.activeRoute, state.activeTrip, fix, state.settings.approachRadiusM);
  const advice = result.events.find((item) => item.type === 'possible-wrong-direction' || item.type === 'route-deviation');
  const nextState = {
    ...state,
    activeTrip: result.trip,
    lastLocationAt: fix.timestamp,
    lastLocation: { latitude: fix.latitude, longitude: fix.longitude },
    lastLocationAccuracyM: fix.accuracyM,
    lastTripNotice: advice?.message ?? state.lastTripNotice,
    locationProblem: result.ignoredReason === 'unmapped-stop'
      ? 'A stop on this route has no location point. Use manual stop confirmation.'
      : result.ignoredReason === 'poor-accuracy'
        ? 'GPS accuracy is too low for an alert. Manual stop confirmation is available.'
        : null,
  };
  await writeAppState(nextState);
  for (const item of result.events) await deliverEvent(item);
  if (result.trip.status !== 'active' && await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
});

export async function beginBackgroundLocation(settings: { updateDistanceM: number; updateIntervalMs: number }): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('navo-trip', {
      name: 'Navo trip alerts',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 120, 250],
      lightColor: '#2478E6',
    });
  }
  const notificationPermission = await Notifications.requestPermissionsAsync();
  if (!notificationPermission.granted) throw new Error('Allow notifications to receive stop alerts. You can still track progress manually.');

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) throw new Error('Allow location while using Navo to start location tracking. You can still track progress manually.');
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) throw new Error('Background location is off. The trip can continue in manual mode, but Navo cannot check stops while closed.');

  const taskOptions: Location.LocationTaskOptions = {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: settings.updateIntervalMs,
    distanceInterval: settings.updateDistanceM,
    pausesUpdatesAutomatically: true,
    ...(Platform.OS === 'ios' ? { showsBackgroundLocationIndicator: true } : {}),
    ...(Platform.OS === 'android' ? {
      foregroundService: {
        notificationTitle: 'Navo trip is active',
        notificationBody: 'Location is used for this destination trip.',
        notificationColor: '#2478E6',
      },
    } : {}),
  };
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, taskOptions);
}

export async function endBackgroundLocation(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}

export async function recordCurrentStop(): Promise<{ latitude: number; longitude: number }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Allow location while using Navo to save this stop.');
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: location.coords.latitude, longitude: location.coords.longitude };
}
