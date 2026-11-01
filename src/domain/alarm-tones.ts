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

export type AlarmToneId = (typeof ALARM_TONES)[number]['id'];
export type AlarmTone = (typeof ALARM_TONES)[number];

export function isAlarmToneId(value: unknown): value is AlarmToneId {
  return ALARM_TONES.some((tone) => tone.id === value);
}

export function getAlarmTone(value: unknown): AlarmTone {
  return ALARM_TONES.find((tone) => tone.id === value) ?? ALARM_TONES[0];
}
