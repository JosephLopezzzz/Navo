import type { EvaluationResult, LocationFix, Stop, TransitRoute, Trip, TripEvent } from './models';

const APPROACH_RADIUS_M = 500;
const ARRIVAL_RADIUS_M = 120;
const MAX_USABLE_ACCURACY_M = 80;
const AWAY_DISTANCE_STEP_M = 150;
const MOVING_AWAY_FIXES = 3;
const OFF_ROUTE_DISTANCE_M = 1_500;
const OFF_ROUTE_FIXES = 3;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

type Coordinates = { latitude: number; longitude: number };

export function distanceBetweenMeters(a: Coordinates, b: Coordinates): number {
  const radiusM = 6_371_000;
  const latitudeDelta = radians((b.latitude ?? 0) - (a.latitude ?? 0));
  const longitudeDelta = radians((b.longitude ?? 0) - (a.longitude ?? 0));
  const firstLatitude = radians(a.latitude ?? 0);
  const secondLatitude = radians(b.latitude ?? 0);
  const value = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return radiusM * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function hasCoordinates(stop: Stop | undefined): stop is Stop & { latitude: number; longitude: number } {
  return stop?.latitude !== undefined && stop.longitude !== undefined;
}

function distanceToSegmentMeters(point: Coordinates, start: Coordinates, end: Coordinates): number {
  const meanLatitude = radians((start.latitude + end.latitude + point.latitude) / 3);
  const metersPerLongitude = 111_320 * Math.cos(meanLatitude);
  const metersPerLatitude = 111_132;
  const endX = (end.longitude - start.longitude) * metersPerLongitude;
  const endY = (end.latitude - start.latitude) * metersPerLatitude;
  const pointX = (point.longitude - start.longitude) * metersPerLongitude;
  const pointY = (point.latitude - start.latitude) * metersPerLatitude;
  const segmentLengthSquared = endX ** 2 + endY ** 2;
  const position = segmentLengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (pointX * endX + pointY * endY) / segmentLengthSquared));
  return Math.hypot(pointX - position * endX, pointY - position * endY);
}

function distanceToRouteMeters(route: TransitRoute, point: Coordinates): number | undefined {
  const stops = route.stops.filter(hasCoordinates);
  if (stops.length < 2 || stops.length !== route.stops.length) return undefined;
  return Math.min(...stops.slice(1).map((stop, index) => distanceToSegmentMeters(point, stops[index]!, stop)));
}

function event(id: string, type: TripEvent['type'], message: string, stopName?: string): TripEvent {
  return { id, type, message, stopName };
}

export function evaluateLocationFix(route: TransitRoute, trip: Trip, fix: LocationFix, approachRadiusM = APPROACH_RADIUS_M): EvaluationResult {
  if (trip.status !== 'active') return { trip, events: [], ignoredReason: 'inactive' };

  const nextIndex = trip.lastConfirmedIndex + 1;
  const nextStop = route.stops[nextIndex];
  const destination = route.stops[trip.destinationIndex];
  if (!hasCoordinates(nextStop) || !hasCoordinates(destination)) {
    return { trip, events: [], ignoredReason: 'unmapped-stop' };
  }
  if (fix.accuracyM === null || fix.accuracyM > MAX_USABLE_ACCURACY_M) {
    return { trip, events: [], ignoredReason: 'poor-accuracy' };
  }

  const here = { latitude: fix.latitude, longitude: fix.longitude };
  const distanceToNextM = distanceBetweenMeters(here, nextStop);
  const distanceToDestinationM = distanceBetweenMeters(here, destination);
  const distanceFromRouteM = distanceToRouteMeters(route, here);
  const movingAwayCount = trip.lastDestinationDistanceM !== undefined &&
    distanceToDestinationM > trip.lastDestinationDistanceM + AWAY_DISTANCE_STEP_M
    ? trip.movingAwayCount + 1
    : 0;
  const offRouteCount = distanceFromRouteM !== undefined && distanceFromRouteM > OFF_ROUTE_DISTANCE_M
    ? trip.offRouteCount + 1
    : 0;
  const updatedTrip: Trip = {
    ...trip,
    lastDestinationDistanceM: distanceToDestinationM,
    movingAwayCount,
    offRouteCount,
  };
  const events: TripEvent[] = [];

  if (distanceToNextM <= approachRadiusM && !trip.approachedStopIds.includes(nextStop.id)) {
    updatedTrip.approachedStopIds = [...trip.approachedStopIds, nextStop.id];
    if (trip.alertMode === 'every-stop' || nextIndex === trip.destinationIndex) {
      events.push(event(`approaching:${nextStop.id}`, 'approaching', `You are approaching ${nextStop.name}.`, nextStop.name));
    }
  }

  if (distanceToNextM <= ARRIVAL_RADIUS_M) {
    updatedTrip.lastConfirmedIndex = nextIndex;
    updatedTrip.arrivedStopIds = [...trip.arrivedStopIds, nextStop.id];
    if (nextIndex === trip.destinationIndex) {
      updatedTrip.status = 'completed';
      events.push(event(`destination:${nextStop.id}`, 'destination-arrived', `You have reached ${nextStop.name}.`, nextStop.name));
    } else if (trip.alertMode === 'every-stop') {
      events.push(event(`arrived:${nextStop.id}`, 'stop-arrived', `You have reached ${nextStop.name}.`, nextStop.name));
    }
  }

  if (movingAwayCount >= MOVING_AWAY_FIXES && !trip.directionAdvisorySent) {
    updatedTrip.directionAdvisorySent = true;
    events.push(event(
      'possible-wrong-direction', 'possible-wrong-direction',
      'Your straight-line distance to the destination has increased several times. Check the route direction; bends and GPS drift can affect this estimate.',
    ));
  }

  if (offRouteCount >= OFF_ROUTE_FIXES && !trip.routeDeviationSent) {
    updatedTrip.routeDeviationSent = true;
    events.push(event(
      'possible-route-deviation', 'route-deviation',
      'Your location is well away from the straight line between saved stops. This coarse check can be wrong on bends or station approaches; check your route.',
    ));
  }

  return { trip: updatedTrip, events, distanceToNextM, distanceToDestinationM, distanceFromRouteM };
}

export function manuallyConfirmNextStop(route: TransitRoute, trip: Trip): EvaluationResult {
  if (trip.status !== 'active') return { trip, events: [], ignoredReason: 'inactive' };
  const nextIndex = trip.lastConfirmedIndex + 1;
  const stop = route.stops[nextIndex];
  if (!stop || nextIndex > trip.destinationIndex) return { trip, events: [], ignoredReason: 'unmapped-stop' };
  const completed = nextIndex === trip.destinationIndex;
  const updatedTrip: Trip = {
    ...trip,
    lastConfirmedIndex: nextIndex,
    status: completed ? 'completed' : 'active',
    arrivedStopIds: [...trip.arrivedStopIds, stop.id],
  };
  return {
    trip: updatedTrip,
    events: [event(`manual:${stop.id}`, completed ? 'destination-arrived' : 'stop-arrived', completed ? `Marked ${stop.name} as your destination.` : `Marked ${stop.name} as the last passed stop.`, stop.name)],
  };
}
