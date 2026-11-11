import { getAlarmDistancePresentation, LIVE_DISTANCE_FRESH_MS } from './alarm-distance-presentation';
import { createDestinationAlarm } from './destination-alarm';
import { UNMAPPED_ROUTE_PROBLEM } from './location-processing';
import { hasValidCoordinates } from './location-quality';
import type { DestinationAlarm, SavedDestination } from './models';
import type { StoredAppState } from '../services/storage';

export interface MonitoringNotification {
  title: string;
  body: string;
  targetKey: string;
  statusKey: string;
  /** One best-effort timer can relabel a silent feed; it never requests GPS. */
  expiresAt: number | null;
}

/** The ongoing service follows the viewed active alarm, then the latest enabled one. */
export function buildMonitoringNotification(state: StoredAppState, now = Date.now()): MonitoringNotification | null {
  const destinations = new Map(state.destinations.map((destination) => [destination.id, destination]));
  const enabled = state.destinationAlarms.filter((alarm) => alarm.enabled && destinations.has(alarm.destinationId))
    .sort((first, second) => (second.armedAt ?? 0) - (first.armedAt ?? 0));
  let alarm: DestinationAlarm | undefined = enabled.find((item) => item.id === state.settings.monitoringAlarmId) ?? enabled[0];
  let destination = alarm ? destinations.get(alarm.destinationId) : undefined;
  let targetKey = alarm ? `alarm:${alarm.id}:${alarm.sessionId}` : '';
  let otherTargets = enabled.length > 1 ? `${enabled.length - 1} other ${enabled.length === 2 ? 'alarm' : 'alarms'} on` : '';

  if (!alarm || !destination) {
    const trip = state.activeTrip;
    const route = state.activeRoute;
    const stop = route?.stops[trip?.destinationIndex ?? -1];
    if (trip?.status !== 'active' || route?.coordinateStatus !== 'complete'
      || stop?.latitude === undefined || stop.longitude === undefined
      || !hasValidCoordinates({ latitude: stop.latitude, longitude: stop.longitude })) return null;
    destination = {
      id: stop.id, name: stop.name, latitude: stop.latitude, longitude: stop.longitude,
      kind: route.mode === 'rail' ? 'rail-station' : 'bus-dropoff', source: 'map-pin',
      createdAt: trip.startedAt, updatedAt: trip.startedAt,
    } satisfies SavedDestination;
    const startedAt = Date.parse(trip.startedAt);
    alarm = {
      ...createDestinationAlarm(trip.id, stop.id, state.settings.approachRadiusM),
      enabled: true, watchState: 'monitoring', armedAt: Number.isFinite(startedAt) ? startedAt : now,
    };
    targetKey = `trip:${trip.id}`;
    otherTargets = route.name;
  }

  const reading = {
    location: state.lastLocation, locationAt: state.lastLocationAt, accuracyM: state.lastLocationAccuracyM,
    problem: state.locationProblem === UNMAPPED_ROUTE_PROBLEM ? null : state.locationProblem,
    trackingProblem: null,
  };
  const presentation = getAlarmDistancePresentation(destination, alarm, reading, now);
  const locationAt = presentation.fixAt;
  // Use a clock time, not "17 seconds ago" that would freeze on a suspended task.
  const checkedAt = locationAt !== null && Number.isFinite(locationAt)
    ? `GPS ${new Date(locationAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : null;
  const summary = presentation.distanceLabel ? `${presentation.distanceLabel} · ${presentation.statusLabel}`
    : presentation.status === 'locating' ? 'Waiting for GPS' : presentation.statusLabel;
  const context = [checkedAt, 'Straight-line estimate', otherTargets || null].filter(Boolean).join(' · ');
  const cleanName = typeof destination.name === 'string' ? destination.name.replace(/\s+/g, ' ').trim() : '';
  return {
    title: cleanName || 'Navo destination',
    body: `${summary}\n${context}`,
    targetKey,
    statusKey: `${targetKey}:${presentation.status}:${presentation.isLastKnown}:${otherTargets}`,
    expiresAt: locationAt !== null && !presentation.isLastKnown && presentation.updatedLabel !== null
      ? locationAt + LIVE_DISTANCE_FRESH_MS + 1 : null,
  };
}
