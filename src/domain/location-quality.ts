import type { LocationFix } from './models';

export const MAX_USABLE_FIX_AGE_MS = 60_000;
export const MAX_USABLE_FIX_ACCURACY_M = 80;
export const MAX_FUTURE_FIX_SKEW_MS = 5_000;

export type LocationFixProblem = 'invalid' | 'poor-accuracy' | 'stale' | 'future' | 'pre-session';

export function hasValidCoordinates(point: { latitude: number; longitude: number }): boolean {
  return Number.isFinite(point.latitude) && point.latitude >= -90 && point.latitude <= 90
    && Number.isFinite(point.longitude) && point.longitude >= -180 && point.longitude <= 180;
}

/** Only usable samples may advance shared timestamps or an alarm session. */
export function getLocationFixProblem(fix: LocationFix, now: number, notBefore?: number | null): LocationFixProblem | null {
  if (!hasValidCoordinates(fix) || !Number.isFinite(fix.timestamp) || fix.timestamp < 0 || !Number.isFinite(now)) return 'invalid';
  if (fix.accuracyM === null || !Number.isFinite(fix.accuracyM) || fix.accuracyM < 0 || fix.accuracyM > MAX_USABLE_FIX_ACCURACY_M) return 'poor-accuracy';
  if (fix.timestamp > now + MAX_FUTURE_FIX_SKEW_MS) return 'future';
  if (now - fix.timestamp > MAX_USABLE_FIX_AGE_MS) return 'stale';
  if (notBefore !== null && notBefore !== undefined && fix.timestamp < notBefore) return 'pre-session';
  return null;
}
