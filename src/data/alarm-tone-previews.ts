import type { BuiltInAlarmToneId } from '../domain/alarm-tones';

export const ALARM_TONE_PREVIEWS: Partial<Record<BuiltInAlarmToneId, number>> = {
  'soft-bell': require('../../assets/sounds/navo_soft_bell.wav'),
  'rising-chime': require('../../assets/sounds/navo_rising_chime.wav'),
  'double-pulse': require('../../assets/sounds/navo_double_pulse.wav'),
};
