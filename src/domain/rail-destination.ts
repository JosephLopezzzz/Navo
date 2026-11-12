import type { RailStationReference, SavedDestination } from './models';

export function normalizeRailStationReference(value: unknown): RailStationReference | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const reference = value as Partial<RailStationReference>;
  if (typeof reference.stationId !== 'string' || !/^[a-z0-9-]{1,100}$/.test(reference.stationId)
    || !['lrt-1', 'lrt-2', 'mrt-3'].includes(reference.lineId ?? '')
    || typeof reference.catalogVersion !== 'string' || reference.catalogVersion.length === 0 || reference.catalogVersion.length > 100
    || typeof reference.coordinateSourceUrl !== 'string' || !/^https:\/\/[^\s]+$/.test(reference.coordinateSourceUrl)
    || typeof reference.reviewedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(reference.reviewedAt)
    || !Number.isFinite(Date.parse(reference.reviewedAt))) return undefined;
  return {
    stationId: reference.stationId,
    lineId: reference.lineId as RailStationReference['lineId'],
    catalogVersion: reference.catalogVersion,
    coordinateSourceUrl: reference.coordinateSourceUrl,
    reviewedAt: reference.reviewedAt,
  };
}

// Stored coordinates are snapshots. Loading an alarm must never move it to a
// newer catalog point or infer station identity from an editable alarm name.
export function normalizeRailDestinationMetadata(destination: SavedDestination): SavedDestination {
  if (!destination || typeof destination !== 'object') return destination;
  const railStation = destination.kind === 'rail-station'
    ? normalizeRailStationReference(destination.railStation)
    : undefined;
  const { railStation: _storedReference, ...saved } = destination;
  return {
    ...saved,
    ...(railStation ? { railStation } : {}),
    source: destination.source === 'rail-catalog' && !railStation ? 'map-pin' : destination.source,
  };
}
