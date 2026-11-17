import { describe, expect, it } from 'vitest';
import { getRailStation, railStations, RAIL_CATALOG_VERSION, type RailLineId } from '../src/data/rail-stations';
import { createRailLineFeature, createRailStationFeatures, createRailStationSelection, getRailLineBounds, resolveRailMapStationTap } from '../src/domain/rail-map';
import { getRailDiagramStations } from '../src/components/rail-diagram-layout';

const lineIds: RailLineId[] = ['lrt-1', 'lrt-2', 'mrt-3'];

describe('geographic rail-only station picker', () => {
  it.each(lineIds)('frames every %s station with real geographic longitude/latitude bounds', (lineId) => {
    const stations = getRailDiagramStations(lineId, railStations);
    const bounds = getRailLineBounds(stations)!;
    const [west, south, east, north] = bounds;
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    for (const station of stations) {
      expect(station.longitude).toBeGreaterThanOrEqual(west);
      expect(station.longitude).toBeLessThanOrEqual(east);
      expect(station.latitude).toBeGreaterThanOrEqual(south);
      expect(station.latitude).toBeLessThanOrEqual(north);
    }
    expect(bounds).toEqual([
      Math.min(...stations.map((station) => station.longitude)),
      Math.min(...stations.map((station) => station.latitude)),
      Math.max(...stations.map((station) => station.longitude)),
      Math.max(...stations.map((station) => station.latitude)),
    ]);
  });

  it.each(lineIds)('connects the %s geographic station points in presentation order without modifying records', (lineId) => {
    const stations = getRailDiagramStations(lineId, railStations);
    const before = JSON.stringify(stations);
    const feature = createRailLineFeature(stations)!;
    expect(feature.type).toBe('Feature');
    expect(feature.properties?.kind).toBe('station-connection');
    expect(feature.geometry.type).toBe('LineString');
    expect(feature.geometry.coordinates).toEqual(stations.map((station) => [station.longitude, station.latitude]));
    expect(JSON.stringify(stations)).toBe(before);
  });

  it('does not manufacture bounds or a route for empty, invalid, mixed-line or single-node connections', () => {
    const station = railStations[0]!;
    expect(getRailLineBounds([])).toBeNull();
    expect(getRailLineBounds([{ latitude: NaN, longitude: station.longitude }])).toBeNull();
    expect(getRailLineBounds([{ latitude: 14, longitude: 181 }])).toBeNull();
    expect(createRailLineFeature([])).toBeNull();
    expect(createRailLineFeature([station])).toBeNull();
    expect(createRailLineFeature([station, getRailStation('lrt-2-recto')!])).toBeNull();
    expect(createRailLineFeature([station, { ...station, latitude: Infinity }])).toBeNull();
  });

  it('confirms only a matching permanent rail identity with the exact catalog point and provenance', () => {
    for (const station of railStations) {
      const selection = createRailStationSelection(station.id, station.lineId)!;
      expect(selection.latitude).toBe(station.latitude);
      expect(selection.longitude).toBe(station.longitude);
      expect(selection.name).toBe(`${station.name} Station`);
      expect(selection.source).toBe('rail-catalog');
      expect(selection.railStation).toEqual({
        stationId: station.id, lineId: station.lineId, catalogVersion: RAIL_CATALOG_VERSION,
        coordinateSourceUrl: station.sourceUrl, reviewedAt: station.reviewedAt,
      });
      expect(selection.providerPlaceId).toBeUndefined();
      expect(selection.railRequestId).toBeUndefined();
    }
    expect(createRailStationSelection('missing')).toBeNull();
    expect(createRailStationSelection('lrt-2-santolan', 'mrt-3')).toBeNull();
    expect(createRailStationSelection('mrt-3-santolan-annapolis', 'lrt-2')).toBeNull();
  });

  it('creates independent snapshots and optionally retains a legacy map handoff request', () => {
    const first = createRailStationSelection('lrt-1-balintawak', 'lrt-1', 'request-1')!;
    expect(first.railRequestId).toBe('request-1');
    first.latitude = 0;
    first.railStation!.catalogVersion = 'changed';
    const second = createRailStationSelection('lrt-1-balintawak', 'lrt-1')!;
    expect(second.latitude).toBe(getRailStation('lrt-1-balintawak')!.latitude);
    expect(second.railStation!.catalogVersion).toBe(RAIL_CATALOG_VERSION);
    expect(second.railRequestId).toBeUndefined();
  });

  it.each(lineIds)('creates selectable geographic point identities for every %s station', (lineId) => {
    const stations = getRailDiagramStations(lineId, railStations);
    const collection = createRailStationFeatures(stations);
    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features.map((feature) => feature.id)).toEqual(stations.map((station) => station.id));
    for (const [index, feature] of collection.features.entries()) {
      expect(feature.properties?.stationId).toBe(stations[index]!.id);
      expect(feature.properties?.lineId).toBe(lineId);
      expect(feature.geometry.coordinates).toEqual([stations[index]!.longitude, stations[index]!.latitude]);
    }
    expect(createRailStationFeatures([]).features).toEqual([]);
  });

  it('selects Anonas at its visual point even when Katipunan is the topmost overlapping hit', () => {
    const stations = getRailDiagramStations('lrt-2', railStations);
    const anonas = getRailStation('lrt-2-anonas')!;
    const katipunan = getRailStation('lrt-2-katipunan')!;
    for (const hits of [[katipunan.id, anonas.id], [anonas.id, katipunan.id]]) {
      expect(resolveRailMapStationTap(stations, anonas, hits)?.id).toBe(anonas.id);
      expect(resolveRailMapStationTap([...stations].reverse(), anonas, hits)?.id).toBe(anonas.id);
      expect(resolveRailMapStationTap(stations, katipunan, hits)?.id).toBe(katipunan.id);
    }
  });

  it('does not turn an empty map hit, invalid coordinate or other line\'s feature into a destination', () => {
    const stations = getRailDiagramStations('lrt-2', railStations);
    const anonas = getRailStation('lrt-2-anonas')!;
    expect(resolveRailMapStationTap(stations, anonas, [])).toBeNull();
    expect(resolveRailMapStationTap(stations, anonas, ['mrt-3-araneta-cubao'])).toBeNull();
    expect(resolveRailMapStationTap(stations, { latitude: NaN, longitude: 121 }, [anonas.id])).toBeNull();
    expect(resolveRailMapStationTap([...stations, getRailStation('mrt-3-ayala')!], anonas, [anonas.id])).toBeNull();
    expect(createRailStationFeatures([...stations, getRailStation('mrt-3-ayala')!]).features).toEqual([]);
  });
});
