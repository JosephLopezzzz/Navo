import { distanceBetweenCoordinatesM, MAX_ALARM_FIX_ACCURACY_M } from './destination-alarm';
import { hasValidCoordinates, MAX_FUTURE_FIX_SKEW_MS } from './location-quality';
import type { DestinationAlarm, SavedDestination } from './models';

export const LIVE_DISTANCE_FRESH_MS = 45_000;

export interface AlarmDistanceReading {
  location: { latitude: number; longitude: number } | null;
  locationAt: number | null;
  accuracyM: number | null;
  problem: string | null;
  trackingProblem: string | null;
}

export interface AlarmDistancePresentation {
  status: 'locating' | 'waiting-to-leave' | 'monitoring' | 'weak-gps' | 'delayed' | 'unavailable' | 'alerted';
  statusLabel: string;
  detail: string;
  distanceLabel: string | null;
  updatedLabel: string | null;
  fixAt: number | null;
  isLastKnown: boolean;
  tone: 'neutral' | 'success' | 'warning';
}

function validTime(timestamp: number | null, armedAt: number | null, now: number): timestamp is number {
  return timestamp !== null && Number.isFinite(timestamp) && timestamp >= 0
    && timestamp <= now + MAX_FUTURE_FIX_SKEW_MS && (armedAt === null || timestamp >= armedAt);
}

export function formatAlarmDistance(distanceM: number): string {
  if (distanceM < 25) return 'About 25 m away';
  if (distanceM < 1000) return `About ${Math.round(distanceM / 25) * 25} m away`;
  return `About ${(distanceM / 1000).toFixed(1)} km away`;
}

function formatFixAge(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `Updated ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
}

/** Presentation only: rounded text and stale states never participate in alarm decisions. */
export function getAlarmDistancePresentation(
  destination: SavedDestination,
  alarm: DestinationAlarm,
  reading: AlarmDistanceReading,
  now: number,
): AlarmDistancePresentation {
  let distanceM: number | null = null;
  let locationAt: number | null = null;
  if (hasValidCoordinates(destination) && alarm.lastDistanceM !== null && Number.isFinite(alarm.lastDistanceM) && alarm.lastDistanceM >= 0
    && validTime(alarm.lastFixAt, alarm.armedAt, now)) {
    distanceM = alarm.lastDistanceM;
    locationAt = alarm.lastFixAt;
  }

  const liveUsable = alarm.enabled && reading.location !== null && hasValidCoordinates(reading.location)
    && hasValidCoordinates(destination) && validTime(reading.locationAt, alarm.armedAt, now)
    && reading.accuracyM !== null && Number.isFinite(reading.accuracyM)
    && reading.accuracyM >= 0 && reading.accuracyM <= MAX_ALARM_FIX_ACCURACY_M;
  if (liveUsable && (locationAt === null || reading.locationAt! >= locationAt)) {
    distanceM = distanceBetweenCoordinatesM(reading.location!, destination);
    locationAt = reading.locationAt;
  }

  const alerted = alarm.watchState === 'alerted';
  const stale = locationAt !== null && now - locationAt > LIVE_DISTANCE_FRESH_MS;
  const isLastKnown = locationAt !== null && (alerted || stale || Boolean(reading.problem || reading.trackingProblem));
  const distanceLabel = distanceM === null ? null : `${isLastKnown ? 'Last known: ' : ''}${formatAlarmDistance(distanceM)}`;
  const updatedLabel = locationAt === null ? null : formatFixAge(locationAt, now);
  const common = { distanceLabel, updatedLabel, isLastKnown, fixAt: locationAt };

  if (alerted) {
    const pending = alarm.pendingEvents.length > 0;
    return {
      ...common, status: 'alerted', statusLabel: pending ? 'Alert pending' : alarm.progress.missedNotified ? 'May have passed your stop' : 'Monitoring finished',
      detail: pending ? 'A stop update is waiting to be delivered.'
        : alarm.progress.missedNotified ? 'Movement away was detected after a close approach. Check your stop; GPS cannot confirm whether you got off.'
          : alarm.progress.arrivalConfirmedAt !== null ? 'The destination area was reached. Monitoring for this trip has ended.'
            : 'Selected alerts have finished. Turn this alarm on again for your next trip.',
      tone: pending || alarm.progress.missedNotified ? 'warning' : 'success',
    };
  }
  if (reading.trackingProblem || !hasValidCoordinates(destination)) {
    return {
      ...common, status: 'unavailable', statusLabel: 'Location unavailable',
      detail: reading.trackingProblem || 'This destination needs a valid saved location.', tone: 'warning',
    };
  }
  if (reading.problem) {
    if (/delayed|fresh GPS|fresh location/i.test(reading.problem)) {
      return { ...common, status: 'delayed', statusLabel: 'Location update delayed', detail: reading.problem, tone: 'warning' };
    }
    if (/unavailable|unreliable|permission|denied|location.*off/i.test(reading.problem)) {
      return { ...common, status: 'unavailable', statusLabel: 'Location unavailable', detail: reading.problem, tone: 'warning' };
    }
    return { ...common, status: 'weak-gps', statusLabel: 'Weak GPS', detail: reading.problem, tone: 'warning' };
  }
  if (stale) {
    return { ...common, status: 'delayed', statusLabel: 'Location update delayed', detail: 'Waiting for a fresh GPS reading. Your last known distance is shown.', tone: 'warning' };
  }
  if (distanceM === null) {
    return { ...common, status: 'locating', statusLabel: 'Finding your location', detail: 'Distance will appear after a usable GPS reading.', tone: 'neutral' };
  }
  if (alarm.watchState === 'awaiting-exit') {
    return { ...common, status: 'waiting-to-leave', statusLabel: 'Waiting to leave the destination area', detail: 'Move away from the destination before Navo checks for your next arrival.', tone: 'neutral' };
  }
  if (alarm.pendingEvents.length) {
    return { ...common, status: 'monitoring', statusLabel: 'Alert pending', detail: 'A stop update is waiting to be delivered. Location checks continue.', tone: 'warning' };
  }
  if (alarm.progress.arrivalConfirmedAt !== null && alarm.notifyOnMissed) {
    return { ...common, status: 'monitoring', statusLabel: 'Destination area reached', detail: 'Checking for movement away. Turn this alarm off when you get off.', tone: 'success' };
  }
  const remaining = alarm.alertDistancesM.filter((distance) => !alarm.progress.notifiedDistancesM.includes(distance)).sort((a, b) => b - a);
  const next = remaining[0];
  const detail = next !== undefined ? `Next reminder at ${next >= 1000 ? `${next / 1000} km` : `${next} m`}.`
    : alarm.notifyOnArrival ? 'Checking for two accurate readings in the destination area.'
      : 'Checking for a close approach followed by sustained movement away.';
  return { ...common, status: 'monitoring', statusLabel: 'Monitoring', detail, tone: 'success' };
}
