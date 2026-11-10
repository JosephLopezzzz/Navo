import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  isPresented: vi.fn(), uri: vi.fn(), present: vi.fn(), nativeDismiss: vi.fn(),
  presented: vi.fn(), schedule: vi.fn(), dismiss: vi.fn(), channels: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('../modules/navo-alarm-sounds', () => ({ default: {
  isNotificationPresented: mocks.isPresented, getSoundUri: mocks.uri,
  presentNotification: mocks.present, dismissNotification: mocks.nativeDismiss,
} }));
vi.mock('expo-notifications', () => ({
  getPresentedNotificationsAsync: mocks.presented, scheduleNotificationAsync: mocks.schedule, dismissNotificationAsync: mocks.dismiss,
}));
vi.mock('../src/services/alarm-permissions', () => ({ ensureAlarmNotificationChannels: mocks.channels }));
import { deliverAlarmNotification, dismissAlarmNotification } from '../src/services/alarm-notification-delivery';
import { getAlarmTone } from '../src/domain/alarm-tones';
import type { ImportedAlarmSound } from '../src/domain/imported-alarm-sounds';
import type { DestinationAlarmEvent } from '../src/domain/models';

const event: DestinationAlarmEvent = {
  id: 'event-1', alarmId: 'alarm-1', destinationId: 'stop-1', sessionId: 'session-1', message: 'Your stop is near.',
};
const sound: ImportedAlarmSound = {
  id: 'imported:example-12345678', label: 'My song', fileName: 'navo_imported_example-12345678.wav',
  durationSeconds: 25, sizeBytes: 1_102_544, createdAt: '2026-11-09T00:00:00.000Z',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPresented.mockResolvedValue(false);
  mocks.uri.mockResolvedValue('file:///private/sound.wav');
  mocks.present.mockResolvedValue(undefined);
  mocks.presented.mockResolvedValue([]);
  mocks.schedule.mockResolvedValue('expo-identifier');
  mocks.channels.mockResolvedValue(undefined);
  mocks.nativeDismiss.mockResolvedValue(undefined);
  mocks.dismiss.mockResolvedValue(undefined);
});

describe('destination sound delivery', () => {
  it('uses the imported file for native delivery instead of treating its filename as a bundled resource', async () => {
    const tone = getAlarmTone(sound.id, [sound]);
    expect(await deliverAlarmNotification(event, tone)).toBe('navo-imported-event-1');
    expect(mocks.present).toHaveBeenCalledWith('navo-imported-event-1', sound.fileName, tone.androidChannelId, sound.label, event.message, {
      eventId: event.id, destinationId: event.destinationId, destinationAlarmId: event.alarmId, navoImportedSound: 'true',
    });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('does not replay an imported alert during a pending-event acknowledgement retry', async () => {
    mocks.isPresented.mockResolvedValue(true);
    expect(await deliverAlarmNotification(event, getAlarmTone(sound.id, [sound]))).toBe('navo-imported-event-1');
    expect(mocks.present).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('keeps one canonical imported identifier when Expo reconstructs the Android notification', async () => {
    mocks.isPresented.mockRejectedValue(new Error('Status check unavailable'));
    mocks.presented.mockResolvedValue([{ request: { identifier: 'expo-internal://notification?tag=navo-imported-event-1&id=0', content: { data: { eventId: event.id, navoImportedSound: 'true' } } } }]);
    expect(await deliverAlarmNotification(event, getAlarmTone(sound.id, [sound]))).toBe('navo-imported-event-1');
    expect(mocks.present).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('uses a normal phone-default notification if an imported file is missing', async () => {
    mocks.uri.mockResolvedValue(null);
    await deliverAlarmNotification(event, getAlarmTone(sound.id, [sound]));
    expect(mocks.present).not.toHaveBeenCalled();
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ content: expect.objectContaining({
      sound: 'default', channelId: 'navo-destination-system-v1', body: expect.stringContaining('phone default'),
    }) }));
  });

  it('falls back when native custom playback cannot be scheduled', async () => {
    mocks.present.mockRejectedValue(new Error('Unavailable'));
    await deliverAlarmNotification(event, getAlarmTone(sound.id, [sound]));
    expect(mocks.schedule).toHaveBeenCalledOnce();
  });

  it('preserves bundled sounds even if the native import-status check fails', async () => {
    mocks.isPresented.mockRejectedValue(new Error('Unavailable'));
    await deliverAlarmNotification(event, getAlarmTone('soft-bell'));
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ content: expect.objectContaining({ sound: 'navo_soft_bell.wav', channelId: 'navo-destination-soft-bell-v1' }) }));
  });

  it('dismisses imported notifications through the same native identifier stored on the alarm', async () => {
    await dismissAlarmNotification('navo-imported-event-1');
    expect(mocks.nativeDismiss).toHaveBeenCalledWith('navo-imported-event-1');
    expect(mocks.dismiss).not.toHaveBeenCalled();
    await dismissAlarmNotification('existing-expo-identifier');
    expect(mocks.dismiss).toHaveBeenCalledWith('existing-expo-identifier');
  });
});
