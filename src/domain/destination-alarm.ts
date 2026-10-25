import type { DestinationAlarm, DestinationAlarmEvent, LocationFix, SavedDestination } from './models';

export const DEFAULT_DESTINATION_RADIUS_M = 500;
export const MAX_ALARM_FIX_ACCURACY_M = 80;
const EXIT_HYSTERESIS_M = 100;
const REQUIRED_INSIDE_FIXES = 2;
const EARTH_RADIUS_M = 6_371_008.8;

export function createDestinationAlarm(id: string, destinationId: string, radiusM = DEFAULT_DESTINATION_RADIUS_M): DestinationAlarm {
  return {
    id,
    destinationId,
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
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function evaluateDestinationAlarmFix(
  destination: SavedDestination,
  alarm: DestinationAlarm,
  fix: LocationFix,
): { alarm: DestinationAlarm; event: DestinationAlarmEvent | null; ignoredReason?: 'inactive' | 'poor-accuracy' | 'out-of-order' } {
  if (!alarm.enabled || !alarm.sessionId || alarm.watchState === 'off' || alarm.watchState === 'alerted') {
    return { alarm, event: null, ignoredReason: 'inactive' };
  }
  if (
    !Number.isFinite(fix.latitude)
    || !Number.isFinite(fix.longitude)
    || !Number.isFinite(fix.timestamp)
    || fix.latitude < -90 || fix.latitude > 90
    || fix.longitude < -180 || fix.longitude > 180
    || fix.accuracyM === null
    || !Number.isFinite(fix.accuracyM)
    || fix.accuracyM > MAX_ALARM_FIX_ACCURACY_M
  ) {
    return { alarm, event: null, ignoredReason: 'poor-accuracy' };
  }
  if (alarm.lastFixAt !== null && fix.timestamp <= alarm.lastFixAt) {
    return { alarm, event: null, ignoredReason: 'out-of-order' };
  }

  const distanceM = distanceBetweenCoordinatesM(fix, destination);
  const next = { ...alarm, lastFixAt: fix.timestamp, lastDistanceM: distanceM };

  if (alarm.watchState === 'awaiting-exit') {
    const exitThresholdM = alarm.radiusM + fix.accuracyM + EXIT_HYSTERESIS_M;
    return {
      alarm: distanceM > exitThresholdM ? { ...next, watchState: 'monitoring' } : next,
      event: null,
    };
  }

  const inside = distanceM <= alarm.radiusM + fix.accuracyM;
  const consecutiveInsideFixes = inside ? alarm.consecutiveInsideFixes + 1 : 0;
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
