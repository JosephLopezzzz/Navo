import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  isPresented: vi.fn(), uri: vi.fn(), present: vi.fn(), nativeDismiss: vi.fn(),
  presented: vi.fn(), schedule: vi.fn(), dismiss: vi.fn(), channels: vi.fn(), devicePresent: vi.fn(), platform: 'android',
}));
vi.mock('react-native', () => ({ Platform: { get OS() { return mocks.platform; } } }));
vi.mock('../modules/navo-alarm-sounds', () => ({ default: {
  isNotificationPresented: mocks.isPresented, getSoundUri: mocks.uri,
  presentNotification: mocks.present, dismissNotification: mocks.nativeDismiss, presentDeviceNotification: mocks.devicePresent,
} }));
vi.mock('expo-notifications', () => ({
  getPresentedNotificationsAsync: mocks.presented, scheduleNotificationAsync: mocks.schedule, dismissNotificationAsync: mocks.dismiss,
}));
vi.mock('../src/services/alarm-permissions', () => ({ ensureAlarmNotificationChannels: mocks.channels }));
import { deliverAlarmNotification, destinationAlarmUrl, dismissAlarmNotification } from '../src/services/alarm-notification-delivery';
import { createDeviceAlarmToneId, getAlarmNotificationChannelId, getAlarmTone, PHONE_ALARM_URI } from '../src/domain/alarm-tones';
import type { ImportedAlarmSound } from '../src/domain/imported-alarm-sounds';
import type { DestinationAlarmEvent } from '../src/domain/models';

const event: DestinationAlarmEvent = {
  id: 'event-1', alarmId: 'alarm-1', destinationId: 'stop-1', sessionId: 'session-1', message: 'Your stop is near.',
  stage: 'approaching', occurredAt: 1000, distanceM: 450,
};
const sound: ImportedAlarmSound = {
  id: 'imported:example-12345678', label: 'My song', fileName: 'navo_imported_example-12345678.wav',
  durationSeconds: 25, sizeBytes: 1_102_544, createdAt: '2026-11-09T00:00:00.000Z',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.platform = 'android';
  mocks.isPresented.mockResolvedValue(false);
  mocks.uri.mockResolvedValue('file:///private/sound.wav');
  mocks.present.mockResolvedValue(undefined);
  mocks.presented.mockResolvedValue([]);
  mocks.schedule.mockResolvedValue('expo-identifier');
  mocks.channels.mockResolvedValue(undefined);
  mocks.nativeDismiss.mockResolvedValue(undefined);
  mocks.dismiss.mockResolvedValue(undefined);
  mocks.devicePresent.mockResolvedValue(undefined);
});

describe('destination sound delivery', () => {
  it('binds bundled notification taps to the actual event and armed session', async () => {
    await deliverAlarmNotification(event, getAlarmTone('soft-bell'));
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ content: expect.objectContaining({
      data: expect.objectContaining({ alarmId: event.alarmId, sessionId: event.sessionId, eventId: event.id,
        occurredAt: '1000', distanceM: '450', url: 'navo://alarm/alert?alarmId=alarm-1&sessionId=session-1&eventId=event-1' }),
    }) }));
  });

  it('encodes session and event identities as data rather than navigation paths', () => {
    const identity = { alarmId: 'alarm /?&', sessionId: 'ride:one&eventId=other', id: 'session:arrived/one' };
    const url = new URL(destinationAlarmUrl(identity));
    expect(url.protocol).toBe('navo:');
    expect(url.host).toBe('alarm');
    expect(url.pathname).toBe('/alert');
    expect([...url.searchParams.entries()]).toEqual([['alarmId', identity.alarmId], ['sessionId', identity.sessionId], ['eventId', identity.id]]);
  });

  it('uses the imported file for native delivery instead of treating its filename as a bundled resource', async () => {
    const tone = getAlarmTone(sound.id, [sound]);
    expect(await deliverAlarmNotification(event, tone)).toBe('navo-imported-event-1');
    expect(mocks.present).toHaveBeenCalledWith('navo-imported-event-1', sound.fileName, getAlarmNotificationChannelId(tone, true), sound.label, event.message, expect.objectContaining({
      eventId: event.id, destinationId: event.destinationId, destinationAlarmId: event.alarmId, navoImportedSound: 'true', vibrationEnabled: 'true', stage: 'approaching',
      alarmId: event.alarmId, sessionId: event.sessionId, url: destinationAlarmUrl(event),
    }));
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
      sound: 'default', body: expect.stringContaining('phone default'),
    }), trigger: { channelId: 'navo-destination-system-v2-vibrate' } }));
  });

  it('falls back when native custom playback cannot be scheduled', async () => {
    mocks.present.mockRejectedValue(new Error('Unavailable'));
    await deliverAlarmNotification(event, getAlarmTone(sound.id, [sound]));
    expect(mocks.schedule).toHaveBeenCalledOnce();
  });

  it('preserves bundled sounds even if the native import-status check fails', async () => {
    mocks.isPresented.mockRejectedValue(new Error('Unavailable'));
    await deliverAlarmNotification(event, getAlarmTone('soft-bell'));
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ content: expect.objectContaining({ sound: 'navo_soft_bell.wav' }), trigger: { channelId: 'navo-destination-soft-bell-v2-vibrate' } }));
  });

  it('selects the no-vibration channel for bundled audio and immediate Android trigger', async () => {
    await deliverAlarmNotification(event, getAlarmTone('clear-signal'), false);
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.objectContaining({ vibrate: [0], sound: 'navo_clear_signal.wav' }),
      trigger: { channelId: 'navo-destination-clear-signal-v2-still' },
    }));
  });

  it('applies no-vibration to imported native playback as well', async () => {
    await deliverAlarmNotification(event, getAlarmTone(sound.id, [sound]), false);
    expect(mocks.present).toHaveBeenCalledWith(expect.any(String), sound.fileName, 'navo-imported-example-12345678-v2-still', sound.label, event.message, expect.objectContaining({ vibrationEnabled: 'false' }));
  });

  it('uses the phone default alarm URI without importing audio', async () => {
    expect(await deliverAlarmNotification(event, getAlarmTone('phone-alarm'), false)).toBe('navo-imported-event-1');
    expect(mocks.devicePresent).toHaveBeenCalledWith('navo-imported-event-1', PHONE_ALARM_URI, 'navo-destination-phone-alarm-v2-still', 'Phone alarm', event.message, expect.objectContaining({ vibrationEnabled: 'false', navoNativeSound: 'true', alarmId: event.alarmId, sessionId: event.sessionId, url: destinationAlarmUrl(event) }));
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('falls back while keeping vibration off when a device tone was removed', async () => {
    mocks.devicePresent.mockRejectedValue(new Error('Sound removed'));
    const tone = getAlarmTone(createDeviceAlarmToneId('content://media/internal/audio/media/25', 'Morning'));
    await deliverAlarmNotification(event, tone, false);
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.objectContaining({ body: expect.stringContaining('unavailable'), vibrate: [0] }),
      trigger: { channelId: 'navo-destination-system-v2-still' },
    }));
  });

  it('uses stage-specific titles for native and bundled notifications', async () => {
    await deliverAlarmNotification({ ...event, stage: 'missed' }, getAlarmTone('phone-alarm'));
    expect(mocks.devicePresent).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything(), event.message, expect.objectContaining({ title: 'You may have passed your stop' }));
    await deliverAlarmNotification({ ...event, stage: 'arrived' }, getAlarmTone('soft-bell'));
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ content: expect.objectContaining({ title: 'You’re at your destination' }) }));
  });

  it('falls back honestly on iOS for a device-specific Android sound', async () => {
    mocks.platform = 'ios';
    await deliverAlarmNotification(event, getAlarmTone('phone-alarm'));
    expect(mocks.devicePresent).not.toHaveBeenCalled();
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ content: expect.objectContaining({ sound: 'default' }), trigger: null }));
  });

  it('dismisses imported notifications through the same native identifier stored on the alarm', async () => {
    await dismissAlarmNotification('navo-imported-event-1');
    expect(mocks.nativeDismiss).toHaveBeenCalledWith('navo-imported-event-1');
    expect(mocks.dismiss).not.toHaveBeenCalled();
    await dismissAlarmNotification('existing-expo-identifier');
    expect(mocks.dismiss).toHaveBeenCalledWith('existing-expo-identifier');
  });
});
