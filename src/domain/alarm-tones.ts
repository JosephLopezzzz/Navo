import type { ImportedAlarmSound } from './imported-alarm-sounds';

export const DEFAULT_ALARM_TONE_ID = 'system-default';

export const ALARM_TONES = [
  {
    id: DEFAULT_ALARM_TONE_ID,
    label: 'System default',
    detail: 'Uses your phone’s notification sound.',
    soundFileName: null,
    androidChannelId: 'navo-destination-system-v1',
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
] as const;

export type BuiltInAlarmToneId = (typeof ALARM_TONES)[number]['id'];
export type AlarmToneId = BuiltInAlarmToneId | ImportedAlarmSound['id'];
export interface AlarmTone {
  id: AlarmToneId;
  label: string;
  detail: string;
  soundFileName: string | null;
  androidChannelId: string;
  imported?: ImportedAlarmSound;
}

export function isBuiltInAlarmToneId(value: unknown): value is BuiltInAlarmToneId {
  return ALARM_TONES.some((tone) => tone.id === value);
}

export function isAlarmToneId(value: unknown, importedSounds: ImportedAlarmSound[] = []): value is AlarmToneId {
  return isBuiltInAlarmToneId(value) || importedSounds.some((sound) => sound.id === value);
}

export function getAlarmTone(value: unknown, importedSounds: ImportedAlarmSound[] = []): AlarmTone {
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
