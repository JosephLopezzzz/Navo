import type { DestinationAlarm, DestinationAlarmEvent, DestinationAlarmProgress, LocationFix, SavedDestination } from './models';
import { DEFAULT_ALARM_TONE_ID } from './alarm-tones';
import { getLocationFixProblem, hasValidCoordinates, MAX_FUTURE_FIX_SKEW_MS, MAX_USABLE_FIX_ACCURACY_M, type LocationFixProblem } from './location-quality';

export const DEFAULT_DESTINATION_RADIUS_M = 500;
export const ALERT_DISTANCE_OPTIONS_M = [200, 500, 1000, 2000] as const;
export const ARRIVAL_RADIUS_M = 100;
export const MAX_ALARM_FIX_ACCURACY_M = MAX_USABLE_FIX_ACCURACY_M;
export const MAX_POST_ARRIVAL_MONITORING_MS = 10 * 60_000;
export const DESTINATION_EXIT_HYSTERESIS_M = 100;
const REQUIRED_INSIDE_FIXES = 2;
const MAX_INSIDE_FIX_GAP_MS = 30_000;
const CLOSE_PASS_RADIUS_M = 200;
const MISSED_DISTANCE_MARGIN_M = 150;
const REQUIRED_MOVING_AWAY_FIXES = 3;
const MIN_MOVING_AWAY_TIME_MS = 10_000;
const MIN_VEHICLE_AWAY_SPEED_MPS = 3;
const EARTH_RADIUS_M = 6_371_008.8;

/** Empty arrays intentionally mean no approaching alerts. Legacy custom radii stay usable. */
export function normalizeAlertDistancesM(value: unknown, legacyRadiusM: unknown = DEFAULT_DESTINATION_RADIUS_M): number[] {
  const candidates = Array.isArray(value) ? value : [legacyRadiusM];
  return [...new Set(candidates.filter((distance): distance is number => typeof distance === 'number'
    && Number.isFinite(distance) && distance > ARRIVAL_RADIUS_M && distance <= 10_000))]
    .sort((first, second) => second - first).slice(0, 8);
}

export function getDestinationWatchRadiusM(distancesM: readonly number[]): number {
  return Math.max(ARRIVAL_RADIUS_M, ...normalizeAlertDistancesM(distancesM));
}

export function hasDestinationAlertStages(alarm: Pick<DestinationAlarm, 'alertDistancesM' | 'notifyOnArrival' | 'notifyOnMissed'>): boolean {
  return alarm.alertDistancesM.length > 0 || alarm.notifyOnArrival || alarm.notifyOnMissed;
}

function emptyProgress(): DestinationAlarmProgress {
  return {
    notifiedDistancesM: [], distanceFixCounts: {}, arrivalFixes: 0, arrivalConfirmedAt: null,
    arrivalNotified: false, closeFixes: 0, closeConfirmedAt: null, closestDistanceUpperM: null,
    lastAccuracyM: null, movingAwayFixes: 0, movingAwayStartedAt: null, movingAwayStartDistanceUpperM: null, missedNotified: false,
  };
}

export function createDestinationAlarm(id: string, destinationId: string, radiusM = DEFAULT_DESTINATION_RADIUS_M): DestinationAlarm {
  const alertDistancesM = normalizeAlertDistancesM(undefined, radiusM);
  return {
    id, destinationId, ringtoneId: DEFAULT_ALARM_TONE_ID, enabled: false,
    radiusM: getDestinationWatchRadiusM(alertDistancesM), alertDistancesM,
    notifyOnArrival: true, notifyOnMissed: true, vibrationEnabled: true,
    watchState: 'off', sessionId: null, armedAt: null, lastFixAt: null, lastDistanceM: null,
    consecutiveInsideFixes: 0, firedAt: null, notificationIdentifier: null,
    progress: emptyProgress(), pendingEvents: [], alertEvents: [], presentedEventIds: [],
  };
}

function finiteNonnegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(3, Math.floor(value))) : 0;
}

/** Normalize saved state without enabling an alarm, remapping coordinates or replaying completed stages. */
export function normalizeDestinationAlarm(value: unknown): DestinationAlarm | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<DestinationAlarm> & { pendingEvent?: unknown };
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.destinationId !== 'string' || !raw.destinationId) return null;
  const base = createDestinationAlarm(raw.id, raw.destinationId);
  const alertDistancesM = normalizeAlertDistancesM(raw.alertDistancesM, raw.radiusM ?? DEFAULT_DESTINATION_RADIUS_M);
  const sessionId = typeof raw.sessionId === 'string' && raw.sessionId ? raw.sessionId : null;
  const watchState = ['off', 'awaiting-exit', 'monitoring', 'alerted'].includes(raw.watchState ?? '') ? raw.watchState! : 'off';
  const armedAt = finiteNonnegative(raw.armedAt);
  const lastFixAt = finiteNonnegative(raw.lastFixAt);
  const sessionTime = (value: unknown) => {
    const time = finiteNonnegative(value);
    return time !== null && armedAt !== null && lastFixAt !== null && time >= armedAt && time <= lastFixAt ? time : null;
  };
  const enabled = raw.enabled === true && sessionId !== null && armedAt !== null && (watchState === 'awaiting-exit' || watchState === 'monitoring');
  const sourceProgress = raw.progress && typeof raw.progress === 'object' ? raw.progress : emptyProgress();
  const progress: DestinationAlarmProgress = {
    ...emptyProgress(),
    notifiedDistancesM: normalizeAlertDistancesM(sourceProgress.notifiedDistancesM, 0).filter((distance) => alertDistancesM.includes(distance)),
    distanceFixCounts: Object.fromEntries(alertDistancesM.flatMap((distance) => {
      const confirmations = count(sourceProgress.distanceFixCounts?.[distance]);
      return confirmations > 0 ? [[distance, confirmations]] : [];
    })),
    arrivalFixes: count(sourceProgress.arrivalFixes),
    arrivalConfirmedAt: sessionTime(sourceProgress.arrivalConfirmedAt),
    arrivalNotified: sourceProgress.arrivalNotified === true,
    closeFixes: count(sourceProgress.closeFixes),
    closeConfirmedAt: sessionTime(sourceProgress.closeConfirmedAt),
    closestDistanceUpperM: finiteNonnegative(sourceProgress.closestDistanceUpperM),
    lastAccuracyM: finiteNonnegative(sourceProgress.lastAccuracyM),
    movingAwayFixes: count(sourceProgress.movingAwayFixes),
    movingAwayStartedAt: sessionTime(sourceProgress.movingAwayStartedAt),
    movingAwayStartDistanceUpperM: finiteNonnegative(sourceProgress.movingAwayStartDistanceUpperM),
    missedNotified: sourceProgress.missedNotified === true,
  };
  if (progress.closeConfirmedAt === null || progress.closestDistanceUpperM === null || progress.closestDistanceUpperM > CLOSE_PASS_RADIUS_M
    || progress.lastAccuracyM === null || progress.lastAccuracyM > MAX_ALARM_FIX_ACCURACY_M) {
    progress.closeConfirmedAt = null;
    progress.closestDistanceUpperM = null;
    progress.movingAwayFixes = 0;
    progress.movingAwayStartedAt = null;
    progress.movingAwayStartDistanceUpperM = null;
  }
  const alarm: DestinationAlarm = {
    ...base, ringtoneId: raw.ringtoneId ?? base.ringtoneId, alertDistancesM,
    radiusM: getDestinationWatchRadiusM(alertDistancesM),
    notifyOnArrival: raw.notifyOnArrival !== false, notifyOnMissed: raw.notifyOnMissed !== false,
    vibrationEnabled: raw.vibrationEnabled !== false,
    enabled, watchState: enabled || watchState === 'alerted' ? watchState : 'off', sessionId,
    armedAt, lastFixAt,
    lastDistanceM: finiteNonnegative(raw.lastDistanceM), consecutiveInsideFixes: count(raw.consecutiveInsideFixes),
    firedAt: finiteNonnegative(raw.firedAt),
    notificationIdentifier: typeof raw.notificationIdentifier === 'string' ? raw.notificationIdentifier : null,
    progress,
  };
  const normalizeEvents = (candidates: unknown[], legacy = false): DestinationAlarmEvent[] => {
    const eventIds = new Set<string>();
    return candidates.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return [];
      const event = candidate as Partial<DestinationAlarmEvent>;
      if (typeof event.id !== 'string' || !event.id || event.alarmId !== alarm.id || event.destinationId !== alarm.destinationId
        || event.sessionId !== sessionId || !sessionId || typeof event.message !== 'string' || eventIds.has(event.id)) return [];
      if (!legacy && !['approaching', 'arrived', 'missed'].includes(event.stage ?? '')) return [];
      const occurredAt = finiteNonnegative(event.occurredAt) ?? (legacy ? alarm.firedAt ?? alarm.armedAt ?? 0 : null);
      const distanceM = finiteNonnegative(event.distanceM) ?? (legacy ? alarm.lastDistanceM ?? alarm.radiusM : null);
      if (occurredAt === null || distanceM === null || occurredAt > Date.now() + MAX_FUTURE_FIX_SKEW_MS
        || (armedAt !== null && occurredAt < armedAt)) return [];
      eventIds.add(event.id);
      return [{
        id: event.id, alarmId: alarm.id, destinationId: alarm.destinationId, sessionId, message: event.message.slice(0, 500),
        stage: legacy ? 'approaching' as const : event.stage!, occurredAt, distanceM,
        ...(finiteNonnegative(event.thresholdM) !== null ? { thresholdM: event.thresholdM }
          : legacy ? { thresholdM: alarm.radiusM } : {}),
      }];
    }).slice(-8);
  };
  const queued = Array.isArray(raw.pendingEvents) ? raw.pendingEvents : raw.pendingEvent ? [raw.pendingEvent] : [];
  alarm.pendingEvents = normalizeEvents(queued, !Array.isArray(raw.pendingEvents));
  // Schema6 has only pending delivery state. Do not invent already delivered
  // historic screens; an explicit empty list in schema7 means acknowledged.
  alarm.alertEvents = Array.isArray(raw.alertEvents) ? normalizeEvents(raw.alertEvents) : alarm.pendingEvents.map((event) => ({ ...event }));
  const latestEventAt = Math.max(-1, ...alarm.alertEvents.map((event) => event.occurredAt), ...alarm.pendingEvents.map((event) => event.occurredAt));
  if (latestEventAt >= 0 && (alarm.firedAt === null || alarm.firedAt < latestEventAt)) alarm.firedAt = latestEventAt;
  const visibleIds = new Set(alarm.alertEvents.map((event) => event.id));
  alarm.presentedEventIds = Array.isArray(raw.presentedEventIds)
    ? [...new Set(raw.presentedEventIds.filter((id): id is string => typeof id === 'string' && visibleIds.has(id)))].slice(-8)
    : [];
  if (!hasDestinationAlertStages(alarm) && alarm.enabled) return disarmDestinationAlarm(alarm);
  return alarm;
}

export function armDestinationAlarm(alarm: DestinationAlarm, sessionId: string, armedAt = Date.now()): DestinationAlarm {
  if (!hasDestinationAlertStages(alarm)) return disarmDestinationAlarm(alarm);
  return {
    ...alarm, radiusM: getDestinationWatchRadiusM(alarm.alertDistancesM), enabled: true, watchState: 'awaiting-exit', sessionId, armedAt,
    lastFixAt: null, lastDistanceM: null, consecutiveInsideFixes: 0, firedAt: null, notificationIdentifier: null,
    progress: emptyProgress(), pendingEvents: [], alertEvents: [], presentedEventIds: [],
  };
}

export function disarmDestinationAlarm(alarm: DestinationAlarm): DestinationAlarm {
  return {
    ...alarm, enabled: false, watchState: 'off', sessionId: null, armedAt: null,
    lastFixAt: null, lastDistanceM: null, consecutiveInsideFixes: 0, notificationIdentifier: null,
    progress: emptyProgress(), pendingEvents: [], alertEvents: [], presentedEventIds: [],
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

function enqueueCurrentEvent(events: DestinationAlarmEvent[], event: DestinationAlarmEvent): DestinationAlarmEvent[] {
  // A delayed OS batch/retry must not ring a superseded distance alert after arrival.
  const useful = events.filter((pending) => {
    if (pending.id === event.id) return false;
    if (event.stage === 'missed') return false;
    if (event.stage === 'arrived') return pending.stage === 'missed';
    return pending.stage !== 'approaching' || (pending.thresholdM ?? Infinity) < (event.thresholdM ?? 0);
  });
  return [...useful, event].slice(-8);
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
  const previousFixAt = alarm.lastFixAt !== null && Number.isFinite(alarm.lastFixAt)
    && alarm.lastFixAt >= 0 && alarm.lastFixAt <= now + MAX_FUTURE_FIX_SKEW_MS
    && (alarm.armedAt === null || alarm.lastFixAt >= alarm.armedAt) ? alarm.lastFixAt : null;
  if (previousFixAt !== null && fix.timestamp <= previousFixAt) return { alarm, event: null, ignoredReason: 'out-of-order' };

  const distanceM = distanceBetweenCoordinatesM(fix, destination);
  const accuracyM = fix.accuracyM!;
  const freshSequence = previousFixAt !== null && fix.timestamp - previousFixAt <= MAX_INSIDE_FIX_GAP_MS;
  const previous = alarm.progress;
  const progress: DestinationAlarmProgress = {
    ...previous, notifiedDistancesM: [...previous.notifiedDistancesM], distanceFixCounts: { ...previous.distanceFixCounts },
    arrivalConfirmedAt: previous.arrivalConfirmedAt !== null && Number.isFinite(previous.arrivalConfirmedAt)
      && previous.arrivalConfirmedAt <= fix.timestamp && (alarm.armedAt === null || previous.arrivalConfirmedAt >= alarm.armedAt)
      ? previous.arrivalConfirmedAt : null,
    ...(freshSequence ? {} : {
      distanceFixCounts: {}, arrivalFixes: 0, closeFixes: 0, closeConfirmedAt: null,
      closestDistanceUpperM: null, movingAwayFixes: 0, movingAwayStartedAt: null,
      movingAwayStartDistanceUpperM: null,
    }),
    lastAccuracyM: accuracyM,
  };
  let next: DestinationAlarm = { ...alarm, lastFixAt: fix.timestamp, lastDistanceM: distanceM, progress };
  if (alarm.watchState === 'awaiting-exit') {
    // Only being at the destination needs a departure guard. A wide approach
    // reminder must not suppress an entire short ride that starts inside it.
    const exitThresholdM = ARRIVAL_RADIUS_M + accuracyM + DESTINATION_EXIT_HYSTERESIS_M;
    return { alarm: distanceM > exitThresholdM ? { ...next, watchState: 'monitoring' } : next, event: null };
  }

  const inside = distanceM <= alarm.radiusM + accuracyM;
  next.consecutiveInsideFixes = inside ? (freshSequence ? alarm.consecutiveInsideFixes : 0) + 1 : 0;
  for (const thresholdM of alarm.alertDistancesM) {
    progress.distanceFixCounts[thresholdM] = distanceM <= thresholdM + accuracyM
      ? (progress.distanceFixCounts[thresholdM] ?? 0) + 1 : 0;
  }
  progress.arrivalFixes = distanceM + accuracyM <= ARRIVAL_RADIUS_M ? progress.arrivalFixes + 1 : 0;
  if (progress.arrivalConfirmedAt === null && progress.arrivalFixes >= REQUIRED_INSIDE_FIXES) progress.arrivalConfirmedAt = fix.timestamp;

  const confidentlyClose = distanceM + accuracyM <= CLOSE_PASS_RADIUS_M;
  progress.closeFixes = confidentlyClose ? progress.closeFixes + 1 : 0;
  if (progress.closeFixes >= REQUIRED_INSIDE_FIXES) {
    progress.closeConfirmedAt ??= fix.timestamp;
    progress.closestDistanceUpperM = Math.min(progress.closestDistanceUpperM ?? Infinity, distanceM + accuracyM);
  }
  const increasing = freshSequence && previous.closeConfirmedAt !== null && alarm.lastDistanceM !== null
    && previous.lastAccuracyM !== null && distanceM > alarm.lastDistanceM + 2
    && (distanceM - alarm.lastDistanceM) / ((fix.timestamp - previousFixAt!) / 1_000) >= MIN_VEHICLE_AWAY_SPEED_MPS;
  if (increasing) {
    progress.movingAwayFixes += 1;
    progress.movingAwayStartedAt ??= previousFixAt;
    progress.movingAwayStartDistanceUpperM ??= alarm.lastDistanceM! + previous.lastAccuracyM!;
  } else {
    progress.movingAwayFixes = 0;
    progress.movingAwayStartedAt = null;
    progress.movingAwayStartDistanceUpperM = null;
  }

  let event: DestinationAlarmEvent | null = null;
  const eventFor = (stage: DestinationAlarmEvent['stage'], message: string, thresholdM?: number): DestinationAlarmEvent => ({
    id: `${alarm.sessionId}:${stage}${thresholdM === undefined ? '' : `:${thresholdM}`}`,
    alarmId: alarm.id, destinationId: destination.id, sessionId: alarm.sessionId!, stage,
    occurredAt: fix.timestamp, distanceM: Math.round(distanceM), message,
    ...(thresholdM === undefined ? {} : { thresholdM }),
  });
  if (alarm.notifyOnMissed && !progress.missedNotified && progress.closestDistanceUpperM !== null
    && progress.movingAwayFixes >= REQUIRED_MOVING_AWAY_FIXES && progress.movingAwayStartedAt !== null
    && fix.timestamp - progress.movingAwayStartedAt >= MIN_MOVING_AWAY_TIME_MS
    && progress.movingAwayStartDistanceUpperM !== null
    && (distanceM - accuracyM - progress.movingAwayStartDistanceUpperM) / ((fix.timestamp - progress.movingAwayStartedAt) / 1_000) >= MIN_VEHICLE_AWAY_SPEED_MPS
    && distanceM - accuracyM >= Math.max(CLOSE_PASS_RADIUS_M, progress.closestDistanceUpperM + MISSED_DISTANCE_MARGIN_M)) {
    progress.missedNotified = true;
    event = eventFor('missed', `You may have passed ${destination.name}. Check your location and your stop.`);
  } else if (alarm.notifyOnArrival && !progress.arrivalNotified && progress.arrivalConfirmedAt !== null) {
    progress.arrivalNotified = true;
    progress.notifiedDistancesM = [...alarm.alertDistancesM];
    event = eventFor('arrived', `You’re in the destination area for ${destination.name}. Check your stop.`);
  } else {
    const due = alarm.alertDistancesM.filter((distance) => !progress.notifiedDistancesM.includes(distance)
      && progress.distanceFixCounts[distance] >= REQUIRED_INSIDE_FIXES);
    if (due.length) {
      const thresholdM = Math.min(...due);
      progress.notifiedDistancesM = [...new Set([...progress.notifiedDistancesM, ...alarm.alertDistancesM.filter((distance) => distance >= thresholdM)])];
      event = eventFor('approaching', `You’re getting close to ${destination.name}. Get ready for your stop.`, thresholdM);
    }
  }
  if (event) next = {
    ...next, firedAt: fix.timestamp, pendingEvents: enqueueCurrentEvent(alarm.pendingEvents, event),
    alertEvents: [...alarm.alertEvents.filter((existing) => existing.id !== event.id), { ...event }].slice(-8),
  };
  const allApproachesConsumed = alarm.alertDistancesM.every((distance) => progress.notifiedDistancesM.includes(distance));
  const done = progress.missedNotified
    || (!alarm.notifyOnMissed && (!alarm.notifyOnArrival || progress.arrivalNotified) && allApproachesConsumed)
    || (progress.arrivalConfirmedAt !== null && fix.timestamp - progress.arrivalConfirmedAt >= MAX_POST_ARRIVAL_MONITORING_MS);
  if (done) next = { ...next, enabled: false, watchState: 'alerted' };
  return { alarm: next, event };
}
