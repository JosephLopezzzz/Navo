import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import NativeAlarmSounds from '../../modules/navo-alarm-sounds';
import { ALARM_TONES, getAlarmNotificationChannelId, type AlarmTone } from '../domain/alarm-tones';
import type { DestinationAlarmEvent } from '../domain/models';
import { ensureAlarmNotificationChannels } from './alarm-permissions';

const IMPORTED_NOTIFICATION_PREFIX = 'navo-imported-';

export function destinationAlarmTitle(event: DestinationAlarmEvent): string {
  return event.stage === 'missed' ? 'You may have passed your stop'
    : event.stage === 'arrived' ? 'You’re at your destination'
      : 'You’re close to your stop';
}

export function destinationAlarmUrl(event: Pick<DestinationAlarmEvent, 'alarmId' | 'sessionId' | 'id'>): string {
  return `navo://alarm/alert?alarmId=${encodeURIComponent(event.alarmId)}&sessionId=${encodeURIComponent(event.sessionId)}&eventId=${encodeURIComponent(event.id)}`;
}

export async function deliverAlarmNotification(event: DestinationAlarmEvent, selectedTone: AlarmTone, vibrationEnabled = true): Promise<string> {
  const importedIdentifier = IMPORTED_NOTIFICATION_PREFIX + event.id;
  // A retry may follow a successful native post but an interrupted SQLite acknowledgement.
  if (NativeAlarmSounds && await NativeAlarmSounds.isNotificationPresented(importedIdentifier).catch(() => false)) return importedIdentifier;
  const presented = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  const existing = presented.find((item) => item.request.content.data?.eventId === event.id);
  if (existing) return existing.request.content.data?.navoImportedSound === 'true' || existing.request.content.data?.navoNativeSound === 'true' ? importedIdentifier : existing.request.identifier;

  const title = destinationAlarmTitle(event);
  const data = {
    eventId: event.id, alarmId: event.alarmId, sessionId: event.sessionId,
    destinationId: event.destinationId, destinationAlarmId: event.alarmId,
    stage: event.stage ?? 'approaching', occurredAt: String(event.occurredAt), distanceM: String(event.distanceM),
    url: destinationAlarmUrl(event), title, vibrationEnabled: String(vibrationEnabled),
  };
  let tone = selectedTone;
  let usedFallback = false;
  if (tone.imported) {
    try {
      if (!NativeAlarmSounds || !await NativeAlarmSounds.getSoundUri(tone.imported.fileName)) throw new Error('Imported sound unavailable');
      await NativeAlarmSounds.presentNotification(importedIdentifier, tone.imported.fileName, getAlarmNotificationChannelId(tone, vibrationEnabled), tone.label, event.message, { ...data, navoImportedSound: 'true', navoNativeSound: 'true' });
      return importedIdentifier;
    } catch {
      tone = ALARM_TONES[0];
      usedFallback = true;
    }
  }
  if (tone.deviceUri) {
    try {
      if (Platform.OS !== 'android' || typeof NativeAlarmSounds?.presentDeviceNotification !== 'function') throw new Error('Phone alarm sounds unavailable');
      await NativeAlarmSounds.presentDeviceNotification(importedIdentifier, tone.deviceUri, getAlarmNotificationChannelId(tone, vibrationEnabled), tone.label, event.message, { ...data, navoNativeSound: 'true' });
      return importedIdentifier;
    } catch {
      tone = ALARM_TONES[0];
      usedFallback = true;
    }
  }
  if (Platform.OS === 'android') await ensureAlarmNotificationChannels();
  return Notifications.scheduleNotificationAsync({
    identifier: `navo-destination-${event.id}`,
    content: {
      title,
      body: usedFallback ? `${event.message} Your saved sound is unavailable; this alert uses the phone default.` : event.message,
      sound: tone.soundFileName ?? 'default',
      data,
      ...(Platform.OS === 'android' ? { vibrate: vibrationEnabled ? [0, 250, 120, 250] : [0] } : {}),
    },
    trigger: Platform.OS === 'android' ? { channelId: getAlarmNotificationChannelId(tone, vibrationEnabled) } : null,
  });
}

export async function dismissAlarmNotification(identifier: string): Promise<void> {
  if (identifier.startsWith(IMPORTED_NOTIFICATION_PREFIX) && NativeAlarmSounds) {
    await NativeAlarmSounds.dismissNotification(identifier);
  } else {
    await Notifications.dismissNotificationAsync(identifier);
  }
}
