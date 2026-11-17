import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { getRailStation, RAIL_CATALOG_VERSION, type RailStation } from '../data/rail-stations';
import type { DestinationMapSelection } from '../state/destination-map-selection';

type StationCoordinate = Pick<RailStation, 'latitude' | 'longitude'>;

function validStationCoordinate(station: StationCoordinate): boolean {
  return Number.isFinite(station.latitude) && station.latitude >= -90 && station.latitude <= 90
    && Number.isFinite(station.longitude) && station.longitude >= -180 && station.longitude <= 180;
}

/** Geographic west/south/east/north bounds; overlay padding belongs to the map UI. */
export function getRailLineBounds(stations: readonly StationCoordinate[]): [number, number, number, number] | null {
  if (!stations.length || !stations.every(validStationCoordinate)) return null;
  return [
    Math.min(...stations.map((station) => station.longitude)),
    Math.min(...stations.map((station) => station.latitude)),
    Math.max(...stations.map((station) => station.longitude)),
    Math.max(...stations.map((station) => station.latitude)),
  ];
}

/** Illustrative station connections, not surveyed railway track geometry. */
export function createRailLineFeature(stations: readonly RailStation[]): Feature<LineString> | null {
  const lineId = stations[0]?.lineId;
  if (stations.length < 2 || !stations.every((station) => station.lineId === lineId && validStationCoordinate(station))) return null;
  return {
    type: 'Feature',
    properties: { lineId, kind: 'station-connection' },
    geometry: { type: 'LineString', coordinates: stations.map((station) => [station.longitude, station.latitude]) },
  };
}

/** Native map circles are queried as geographic features, not overlapping view rectangles. */
export function createRailStationFeatures(stations: readonly RailStation[]): FeatureCollection<Point> {
  const lineId = stations[0]?.lineId;
  if (!stations.every((station) => station.lineId === lineId && validStationCoordinate(station))) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: stations.map((station) => ({
      type: 'Feature', id: station.id,
      properties: { stationId: station.id, lineId: station.lineId, name: station.name },
      geometry: { type: 'Point', coordinates: [station.longitude, station.latitude] },
    })),
  };
}

/** Resolve overlapping native feature hits by distance from the actual map tap. */
export function resolveRailMapStationTap(
  stations: readonly RailStation[],
  tap: StationCoordinate,
  hitStationIds: readonly string[],
): RailStation | null {
  const lineId = stations[0]?.lineId;
  if (!validStationCoordinate(tap) || !stations.every((station) => station.lineId === lineId)) return null;
  const hits = new Set(hitStationIds);
  const longitudeScale = Math.cos(tap.latitude * Math.PI / 180);
  let nearest: RailStation | null = null;
  let nearestDistance = Infinity;
  for (const station of stations) {
    if (!hits.has(station.id) || !validStationCoordinate(station)) continue;
    const longitudeDelta = (station.longitude - tap.longitude) * longitudeScale;
    const latitudeDelta = station.latitude - tap.latitude;
    const distance = longitudeDelta * longitudeDelta + latitudeDelta * latitudeDelta;
    if (distance < nearestDistance) { nearest = station; nearestDistance = distance; }
  }
  return nearest;
}

/** Confirm a permanent catalog identity, never a camera center or a search-provider point. */
export function createRailStationSelection(stationId: string, expectedLineId?: string, railRequestId?: string): DestinationMapSelection | null {
  const station = getRailStation(stationId);
  if (!station || (expectedLineId !== undefined && station.lineId !== expectedLineId) || !validStationCoordinate(station)) return null;
  return {
    latitude: station.latitude,
    longitude: station.longitude,
    name: /\bstation$/i.test(station.name) ? station.name : `${station.name} Station`,
    subtitle: `${station.lineId.toUpperCase()} · ${station.city}`,
    source: 'rail-catalog',
    railStation: {
      stationId: station.id,
      lineId: station.lineId,
      catalogVersion: RAIL_CATALOG_VERSION,
      coordinateSourceUrl: station.sourceUrl,
      reviewedAt: station.reviewedAt,
    },
    ...(railRequestId ? { railRequestId } : {}),
  };
}
