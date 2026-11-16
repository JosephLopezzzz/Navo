import type { BuiltInAlarmToneId } from '../domain/alarm-tones';

export const ALARM_TONE_PREVIEWS: Partial<Record<BuiltInAlarmToneId, number>> = {
  'soft-bell': require('../../assets/sounds/navo_soft_bell.wav'),
  'rising-chime': require('../../assets/sounds/navo_rising_chime.wav'),
  'double-pulse': require('../../assets/sounds/navo_double_pulse.wav'),
  'clear-signal': require('../../assets/sounds/navo_clear_signal.wav'),
  'gentle-rise': require('../../assets/sounds/navo_gentle_rise.wav'),
  'steady-beacon': require('../../assets/sounds/navo_steady_beacon.wav'),
};
