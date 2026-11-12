import type { AlarmToneId } from './alarm-tones';

export type TransitMode = 'rail' | 'bus';
export type RouteDataQuality = 'preview' | 'user-authored';
export type CoordinateStatus = 'missing' | 'complete';

export interface Stop { id: string; name: string; latitude?: number; longitude?: number }
export interface TransitRoute {
  id: string;
  name: string;
  mode: TransitMode;
  direction: string;
  dataQuality: RouteDataQuality;
  coordinateStatus: CoordinateStatus;
  sourceLabel: string;
  sourceUrl?: string;
  stops: Stop[];
}
export type AlertMode = 'every-stop' | 'destination-only';
export interface Trip {
  id: string;
  routeId: string;
  boardingIndex: number;
  destinationIndex: number;
  lastConfirmedIndex: number;
  alertMode: AlertMode;
  startedAt: string;
  status: 'active' | 'completed' | 'cancelled';
  approachedStopIds: string[];
  arrivedStopIds: string[];
  lastDestinationDistanceM?: number;
  movingAwayCount: number;
  directionAdvisorySent: boolean;
  offRouteCount: number;
  routeDeviationSent: boolean;
}
export interface LocationFix { latitude: number; longitude: number; accuracyM: number | null; timestamp: number; speedMps?: number | null }
export type TripEventType = 'approaching' | 'stop-arrived' | 'destination-arrived' | 'possible-wrong-direction' | 'route-deviation' | 'location-quality';
export interface TripEvent { id: string; type: TripEventType; stopName?: string; message: string }
export interface EvaluationResult {
  trip: Trip;
  events: TripEvent[];
  distanceToNextM?: number;
  distanceToDestinationM?: number;
  distanceFromRouteM?: number;
  ignoredReason?: 'inactive' | 'unmapped-stop' | 'poor-accuracy';
}

export type DestinationKind = 'rail-station' | 'bus-dropoff' | 'place';
export type DestinationSource = 'map-pin' | 'tomtom' | 'rail-catalog';
export interface RailStationReference {
  stationId: string;
  lineId: 'lrt-1' | 'lrt-2' | 'mrt-3';
  catalogVersion: string;
  coordinateSourceUrl: string;
  reviewedAt: string;
}
export interface SavedDestination {
  id: string;
  name: string;
  subtitle?: string;
  latitude: number;
  longitude: number;
  kind: DestinationKind;
  source: DestinationSource;
  providerPlaceId?: string;
  railStation?: RailStationReference;
  createdAt: string;
  updatedAt: string;
}

export type DestinationWatchState = 'off' | 'awaiting-exit' | 'monitoring' | 'alerted';
export interface DestinationAlarm {
  id: string;
  destinationId: string;
  ringtoneId: AlarmToneId;
  enabled: boolean;
  radiusM: number;
  watchState: DestinationWatchState;
  sessionId: string | null;
  armedAt: number | null;
  lastFixAt: number | null;
  lastDistanceM: number | null;
  consecutiveInsideFixes: number;
  firedAt: number | null;
  notificationIdentifier: string | null;
  pendingEvent: DestinationAlarmEvent | null;
}

export interface DestinationAlarmEvent {
  id: string;
  alarmId: string;
  destinationId: string;
  sessionId: string;
  message: string;
}
