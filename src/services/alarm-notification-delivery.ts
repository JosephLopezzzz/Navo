import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import NativeAlarmSounds from '../../modules/navo-alarm-sounds';
import { ALARM_TONES, type AlarmTone } from '../domain/alarm-tones';
import type { DestinationAlarmEvent } from '../domain/models';
import { ensureAlarmNotificationChannels } from './alarm-permissions';

const IMPORTED_NOTIFICATION_PREFIX = 'navo-imported-';

export async function deliverAlarmNotification(event: DestinationAlarmEvent, selectedTone: AlarmTone): Promise<string> {
  const importedIdentifier = IMPORTED_NOTIFICATION_PREFIX + event.id;
  // A retry may follow a successful native post but an interrupted SQLite acknowledgement.
  if (NativeAlarmSounds && await NativeAlarmSounds.isNotificationPresented(importedIdentifier).catch(() => false)) return importedIdentifier;
  const presented = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  const existing = presented.find((item) => item.request.content.data?.eventId === event.id);
  if (existing) return existing.request.content.data?.navoImportedSound === 'true' ? importedIdentifier : existing.request.identifier;

  const data = { eventId: event.id, destinationId: event.destinationId, destinationAlarmId: event.alarmId };
  let tone = selectedTone;
  let usedFallback = false;
  if (tone.imported) {
    try {
      if (!NativeAlarmSounds || !await NativeAlarmSounds.getSoundUri(tone.imported.fileName)) throw new Error('Imported sound unavailable');
      await NativeAlarmSounds.presentNotification(importedIdentifier, tone.imported.fileName, tone.androidChannelId, tone.label, event.message, { ...data, navoImportedSound: 'true' });
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
      title: 'Your stop is near',
      body: usedFallback ? `${event.message} Your saved sound is unavailable; this alert uses the phone default.` : event.message,
      sound: tone.soundFileName ?? 'default',
      data,
      ...(Platform.OS === 'android' ? { channelId: tone.androidChannelId } : {}),
    },
    trigger: null,
  });
}

export async function dismissAlarmNotification(identifier: string): Promise<void> {
  if (identifier.startsWith(IMPORTED_NOTIFICATION_PREFIX) && NativeAlarmSounds) {
    await NativeAlarmSounds.dismissNotification(identifier);
  } else {
    await Notifications.dismissNotificationAsync(identifier);
  }
}
