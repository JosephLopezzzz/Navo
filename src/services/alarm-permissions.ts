import { Platform } from 'react-native';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';

export interface AlarmPermissionSummary {
  notifications: boolean;
  foreground: boolean;
  background: boolean;
  ready: boolean;
}

export async function readAlarmPermissions(): Promise<AlarmPermissionSummary> {
  const [notifications, foreground, background] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return {
    notifications: notifications.granted,
    foreground: foreground.granted,
    background: background.granted,
    ready: notifications.granted && foreground.granted && background.granted,
  };
}

export async function requestAlarmPermissions(): Promise<AlarmPermissionSummary> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('navo-trip', {
      name: 'Navo trip alerts',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 120, 250],
      lightColor: '#0869A8',
    });
  }

  let state = await readAlarmPermissions();
  if (!state.notifications) {
    await Notifications.requestPermissionsAsync();
    state = await readAlarmPermissions();
    if (!state.notifications) return state;
  }
  if (!state.foreground) {
    await Location.requestForegroundPermissionsAsync();
    state = await readAlarmPermissions();
    if (!state.foreground) return state;
  }
  if (!state.background) {
    await Location.requestBackgroundPermissionsAsync();
    state = await readAlarmPermissions();
  }
  return state;
}

export function permissionHelpText(state: AlarmPermissionSummary): string {
  if (!state.notifications) return 'Notifications are off. Allow them in your phone settings to receive arrival alerts.';
  if (!state.foreground) return 'Location access is off. Allow it while using Navo so the alarm can check your distance.';
  if (!state.background) return 'Background location is off. Allow it so Navo can check this stop while the app is closed.';
  return 'Location and notification access are ready for destination alarms.';
}
