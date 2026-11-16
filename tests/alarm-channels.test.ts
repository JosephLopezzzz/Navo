import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ channel: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 }, AndroidAudioUsage: { ALARM: 4 }, AndroidAudioContentType: { SONIFICATION: 4 },
  setNotificationChannelAsync: mocks.channel,
}));
vi.mock('expo-location', () => ({}));
import { ensureAlarmNotificationChannels } from '../src/services/alarm-permissions';

beforeEach(() => { vi.clearAllMocks(); mocks.channel.mockResolvedValue(null); });

describe('Android destination notification channels', () => {
  it('uses separate immutable channels for sound with and without vibration', async () => {
    await ensureAlarmNotificationChannels();
    expect(mocks.channel).toHaveBeenCalledWith('navo-destination-soft-bell-v2-vibrate', expect.objectContaining({ enableVibrate: true, sound: 'navo_soft_bell.wav', audioAttributes: { usage: 4, contentType: 4 } }));
    expect(mocks.channel).toHaveBeenCalledWith('navo-destination-soft-bell-v2-still', expect.objectContaining({ enableVibrate: false, vibrationPattern: [0], sound: 'navo_soft_bell.wav' }));
    expect(mocks.channel.mock.calls.some(([id]) => id === 'navo-destination-soft-bell-v1')).toBe(false);
  });

  it('leaves URI-backed phone channels to the native alarm sound implementation', async () => {
    await ensureAlarmNotificationChannels();
    expect(mocks.channel.mock.calls.some(([id]) => String(id).includes('phone-alarm'))).toBe(false);
  });
});
