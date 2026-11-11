import type { DestinationAlarm, DestinationAlarmEvent, LocationFix, SavedDestination } from './models';
import { DEFAULT_ALARM_TONE_ID } from './alarm-tones';
import { getLocationFixProblem, hasValidCoordinates, MAX_FUTURE_FIX_SKEW_MS, MAX_USABLE_FIX_ACCURACY_M, type LocationFixProblem } from './location-quality';

export const DEFAULT_DESTINATION_RADIUS_M = 500;
export const MAX_ALARM_FIX_ACCURACY_M = MAX_USABLE_FIX_ACCURACY_M;
const EXIT_HYSTERESIS_M = 100;
const REQUIRED_INSIDE_FIXES = 2;
const MAX_INSIDE_FIX_GAP_MS = 30_000;
const EARTH_RADIUS_M = 6_371_008.8;

export function createDestinationAlarm(id: string, destinationId: string, radiusM = DEFAULT_DESTINATION_RADIUS_M): DestinationAlarm {
  return {
    id,
    destinationId,
    ringtoneId: DEFAULT_ALARM_TONE_ID,
    enabled: false,
    radiusM,
    watchState: 'off',
    sessionId: null,
    armedAt: null,
    lastFixAt: null,
    lastDistanceM: null,
    consecutiveInsideFixes: 0,
    firedAt: null,
    notificationIdentifier: null,
    pendingEvent: null,
  };
}

export function armDestinationAlarm(alarm: DestinationAlarm, sessionId: string, armedAt = Date.now()): DestinationAlarm {
  return {
    ...alarm,
    enabled: true,
    watchState: 'awaiting-exit',
    sessionId,
    armedAt,
    lastFixAt: null,
    lastDistanceM: null,
    consecutiveInsideFixes: 0,
    firedAt: null,
    notificationIdentifier: null,
    pendingEvent: null,
  };
}

export function disarmDestinationAlarm(alarm: DestinationAlarm): DestinationAlarm {
  return {
    ...alarm,
    enabled: false,
    watchState: 'off',
    sessionId: null,
    armedAt: null,
    lastFixAt: null,
    lastDistanceM: null,
    consecutiveInsideFixes: 0,
    notificationIdentifier: null,
    pendingEvent: null,
  };
}

export function distanceBetweenCoordinatesM(
  first: Pick<LocationFix, 'latitude' | 'longitude'>,
  second: Pick<LocationFix, 'latitude' | 'longitude'>,
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const bounded = Math.max(0, Math.min(1, haversine));
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}

export function evaluateDestinationAlarmFix(
  destination: SavedDestination,
  alarm: DestinationAlarm,
  fix: LocationFix,
  now = Date.now(),
): { alarm: DestinationAlarm; event: DestinationAlarmEvent | null; ignoredReason?: 'inactive' | 'out-of-order' | 'invalid-destination' | LocationFixProblem } {
  if (!alarm.enabled || !alarm.sessionId || alarm.watchState === 'off' || alarm.watchState === 'alerted') {
    return { alarm, event: null, ignoredReason: 'inactive' };
  }
  if (!hasValidCoordinates(destination) || !Number.isFinite(alarm.radiusM) || alarm.radiusM < 0) return { alarm, event: null, ignoredReason: 'invalid-destination' };
  const problem = getLocationFixProblem(fix, now, alarm.armedAt);
  if (problem) return { alarm, event: null, ignoredReason: problem };
  // Older builds could persist a malformed/future watermark. Do not let it
  // block a fresh fix or contribute a false first arrival confirmation.
  const previousFixAt = alarm.lastFixAt !== null && Number.isFinite(alarm.lastFixAt)
    && alarm.lastFixAt >= 0 && alarm.lastFixAt <= now + MAX_FUTURE_FIX_SKEW_MS
    && (alarm.armedAt === null || alarm.lastFixAt >= alarm.armedAt) ? alarm.lastFixAt : null;
  if (previousFixAt !== null && fix.timestamp <= previousFixAt) {
    return { alarm, event: null, ignoredReason: 'out-of-order' };
  }

  const distanceM = distanceBetweenCoordinatesM(fix, destination);
  const next = { ...alarm, lastFixAt: fix.timestamp, lastDistanceM: distanceM };

  if (alarm.watchState === 'awaiting-exit') {
    const exitThresholdM = alarm.radiusM + fix.accuracyM! + EXIT_HYSTERESIS_M;
    return {
      alarm: distanceM > exitThresholdM ? { ...next, watchState: 'monitoring' } : next,
      event: null,
    };
  }

  const inside = distanceM <= alarm.radiusM + fix.accuracyM!;
  const previousInsideFixes = previousFixAt !== null && fix.timestamp - previousFixAt <= MAX_INSIDE_FIX_GAP_MS
    ? alarm.consecutiveInsideFixes : 0;
  const consecutiveInsideFixes = inside ? previousInsideFixes + 1 : 0;
  if (consecutiveInsideFixes < REQUIRED_INSIDE_FIXES) {
    return { alarm: { ...next, consecutiveInsideFixes }, event: null };
  }

  const sessionId = alarm.sessionId;
  const event: DestinationAlarmEvent = {
    id: `${sessionId}:${fix.timestamp}`,
    alarmId: alarm.id,
    destinationId: destination.id,
    sessionId,
    message: `You are near ${destination.name}.`,
  };
  return {
    alarm: {
      ...next,
      enabled: false,
      watchState: 'alerted',
      consecutiveInsideFixes,
      firedAt: fix.timestamp,
      pendingEvent: event,
    },
    event,
  };
}
