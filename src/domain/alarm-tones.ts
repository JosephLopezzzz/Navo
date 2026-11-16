import type { ImportedAlarmSound } from './imported-alarm-sounds';

export const DEFAULT_ALARM_TONE_ID = 'system-default';
export const PHONE_ALARM_URI = 'content://settings/system/alarm_alert';

export const ALARM_TONES = [
  {
    id: DEFAULT_ALARM_TONE_ID,
    label: 'System default',
    detail: 'Uses your phone’s notification sound.',
    soundFileName: null,
    androidChannelId: 'navo-destination-system-v1',
  },
  {
    id: 'phone-alarm',
    label: 'Phone alarm',
    detail: 'Uses this Android phone’s current alarm sound. No audio copied.',
    soundFileName: null,
    androidChannelId: 'navo-destination-phone-alarm-v1',
    deviceUri: PHONE_ALARM_URI,
    androidOnly: true,
  },
  {
    id: 'soft-bell',
    label: 'Soft Bell',
    detail: 'A gentle single bell.',
    soundFileName: 'navo_soft_bell.wav',
    androidChannelId: 'navo-destination-soft-bell-v1',
  },
  {
    id: 'rising-chime',
    label: 'Rising Chime',
    detail: 'Three clear notes that rise.',
    soundFileName: 'navo_rising_chime.wav',
    androidChannelId: 'navo-destination-rising-chime-v1',
  },
  {
    id: 'double-pulse',
    label: 'Double Pulse',
    detail: 'Two quick pairs of tones.',
    soundFileName: 'navo_double_pulse.wav',
    androidChannelId: 'navo-destination-double-pulse-v1',
  },
  { id: 'clear-signal', label: 'Clear Signal', detail: 'Three short, bright notes.', soundFileName: 'navo_clear_signal.wav', androidChannelId: 'navo-destination-clear-signal-v1' },
  { id: 'gentle-rise', label: 'Gentle Rise', detail: 'A soft two-note rise.', soundFileName: 'navo_gentle_rise.wav', androidChannelId: 'navo-destination-gentle-rise-v1' },
  { id: 'steady-beacon', label: 'Steady Beacon', detail: 'A measured pair of low pulses.', soundFileName: 'navo_steady_beacon.wav', androidChannelId: 'navo-destination-steady-beacon-v1' },
] as const;

export type BuiltInAlarmToneId = (typeof ALARM_TONES)[number]['id'];
export type DeviceAlarmToneId = `device:${string}`;
export type AlarmToneId = BuiltInAlarmToneId | ImportedAlarmSound['id'] | DeviceAlarmToneId;
export interface AlarmTone {
  id: AlarmToneId;
  label: string;
  detail: string;
  soundFileName: string | null;
  androidChannelId: string;
  imported?: ImportedAlarmSound;
  deviceUri?: string;
  androidOnly?: boolean;
}

export function isDeviceAlarmUri(value: unknown): value is string {
  return typeof value === 'string' && /^content:\/\/(?:media\/(?:internal|external|external_primary)\/audio\/media\/[1-9]\d{0,19}|settings\/system\/alarm_alert)$/.test(value);
}

export function createDeviceAlarmToneId(uri: string, label: string): DeviceAlarmToneId {
  if (!isDeviceAlarmUri(uri)) throw new Error('This phone sound is unavailable.');
  const safeLabel = label.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Phone sound';
  return `device:${encodeURIComponent(uri)}|${encodeURIComponent(safeLabel)}`;
}

export function parseDeviceAlarmTone(value: unknown): { uri: string; label: string } | null {
  if (typeof value !== 'string' || !value.startsWith('device:') || value.length > 1_200) return null;
  const parts = value.slice('device:'.length).split('|');
  if (parts.length !== 2) return null;
  try {
    const uri = decodeURIComponent(parts[0]);
    const label = decodeURIComponent(parts[1]);
    if (!isDeviceAlarmUri(uri) || !label.trim() || label.length > 80 || /[\u0000-\u001f\u007f]/.test(label)) return null;
    return { uri, label };
  } catch { return null; }
}

/** Sound and vibration are immutable once an Android channel has been created. */
export function getAlarmNotificationChannelId(tone: AlarmTone, vibrationEnabled: boolean): string {
  return `${tone.androidChannelId.replace(/-v1$/, '-v2')}-${vibrationEnabled ? 'vibrate' : 'still'}`;
}

export function isBuiltInAlarmToneId(value: unknown): value is BuiltInAlarmToneId {
  return ALARM_TONES.some((tone) => tone.id === value);
}

export function isAlarmToneId(value: unknown, importedSounds: ImportedAlarmSound[] = []): value is AlarmToneId {
  return isBuiltInAlarmToneId(value) || parseDeviceAlarmTone(value) !== null || importedSounds.some((sound) => sound.id === value);
}

export function getAlarmTone(value: unknown, importedSounds: ImportedAlarmSound[] = []): AlarmTone {
  const device = parseDeviceAlarmTone(value);
  if (device) return {
    id: value as DeviceAlarmToneId, label: device.label, detail: 'Phone alarm sound · no audio copied',
    soundFileName: null, androidChannelId: `navo-device-${device.uri.replace('content://', '').replace(/\//g, '-')}-v1`,
    deviceUri: device.uri, androidOnly: true,
  };
  const imported = importedSounds.find((sound) => sound.id === value);
  if (imported) return {
    id: imported.id,
    label: imported.label,
    detail: `${Math.ceil(imported.durationSeconds)} sec · imported audio`,
    soundFileName: imported.fileName,
    androidChannelId: `navo-imported-${imported.id.slice('imported:'.length)}-v1`,
    imported,
  };
  return ALARM_TONES.find((tone) => tone.id === value) ?? ALARM_TONES[0];
}
