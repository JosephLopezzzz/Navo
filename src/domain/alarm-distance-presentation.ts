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
  const common = { distanceLabel, updatedLabel, isLastKnown };

  if (alerted) {
    return {
      ...common, status: 'alerted', statusLabel: alarm.pendingEvent ? 'Alert pending' : 'Alert sent',
      detail: alarm.pendingEvent ? 'Arrival detected. Navo is trying to deliver your alert.' : 'This alarm stopped after detecting your arrival.',
      tone: alarm.pendingEvent ? 'warning' : 'success',
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
    return { ...common, status: 'waiting-to-leave', statusLabel: 'Waiting to leave the alert area', detail: 'Move outside the alert area before Navo checks for your next arrival.', tone: 'neutral' };
  }
  return { ...common, status: 'monitoring', statusLabel: 'Monitoring', detail: `Alerts within ${alarm.radiusM} m of your saved destination.`, tone: 'success' };
}
