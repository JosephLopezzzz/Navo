import { describe, expect, it } from 'vitest';
import { createDeviceAlarmToneId, getAlarmNotificationChannelId, getAlarmTone, isAlarmToneId, parseDeviceAlarmTone } from '../src/domain/alarm-tones';

describe('phone alarm sound references', () => {
  it('keeps a phone sound choice and readable title through JSON persistence without audio data', () => {
    const id = createDeviceAlarmToneId('content://media/internal/audio/media/18', 'Morning | Bell');
    const restored: unknown = JSON.parse(JSON.stringify(id));
    expect(isAlarmToneId(restored)).toBe(true);
    expect(getAlarmTone(restored)).toMatchObject({ label: 'Morning | Bell', deviceUri: 'content://media/internal/audio/media/18', androidOnly: true });
  });

  it.each(['file:///private/secret.wav', 'https://example.com/alarm.wav', 'content://another.app/private/1', 'content://media/internal/audio/media/1?x=y', 'content://media/internal/audio/media/../1'])('rejects arbitrary or malformed audio URI %s', (uri) => {
    expect(() => createDeviceAlarmToneId(uri, 'Alarm')).toThrow();
    expect(isAlarmToneId(`device:${encodeURIComponent(uri)}|Alarm`)).toBe(false);
  });

  it('rejects corrupt encoded persisted selections instead of crashing storage reads', () => {
    expect(parseDeviceAlarmTone('device:%E0%A4%A|Alarm')).toBeNull();
    expect(parseDeviceAlarmTone('device:one|two|three')).toBeNull();
  });

  it('separates vibration channels without changing sound identity', () => {
    const tone = getAlarmTone(createDeviceAlarmToneId('content://media/internal/audio/media/12', 'Alarm'));
    expect(getAlarmNotificationChannelId(tone, false)).not.toBe(getAlarmNotificationChannelId(tone, true));
    expect(getAlarmNotificationChannelId(tone, false)).toContain('media-internal-audio-media-12-v2-still');
  });
});
