import { describe, expect, it } from 'vitest';
import { getRailStation, railStations, RAIL_CATALOG_VERSION, searchRailStations } from '../src/data/rail-stations';
import { railLines } from '../src/data/routes';

function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const latitude = (b.latitude - a.latitude) * rad;
  const longitude = (b.longitude - a.longitude) * rad;
  const h = Math.sin(latitude / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(longitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

describe('local rail station destinations', () => {
  it('maps every existing route stop to one permanent station without enabling journey coordinates', () => {
    expect(railStations).toHaveLength(51);
    expect(new Set(railStations.map((station) => station.id)).size).toBe(51);
    expect(new Set(railStations.map((station) => station.stopId)).size).toBe(51);
    for (const line of railLines) {
      const stations = searchRailStations(line.id, '');
      expect(stations.map((station) => [station.stopId, station.name])).toEqual(
        line.stops.map((stop) => [stop.id, stop.name]),
      );
      expect(line.coordinateStatus).toBe('missing');
      expect(line.stops.every((stop) => stop.latitude === undefined && stop.longitude === undefined)).toBe(true);
    }
  });

  it('resolves Fernando Poe Jr., FPJ and Roosevelt to one station instead of general place matches', () => {
    const station = getRailStation('lrt-1-fernando-poe-jr');
    expect(station?.city).toBe('Quezon City');
    expect(station?.latitude).toBeCloseTo(14.657494444444, 9);
    expect(station?.longitude).toBeCloseTo(121.02121111111, 9);
    for (const query of [
      'Fernando Poe', 'Fernando Poe Jr.', 'fpj', 'Roosevelt Station',
      'Fernando Poe Junior', 'LRT-1, Fernando Poe Jr. Station, Philippines',
    ]) {
      expect(searchRailStations('lrt-1', query)).toEqual([station]);
    }
    expect(searchRailStations('mrt-3', 'Roosevelt')).toEqual([]);
    expect(searchRailStations('lrt-2', 'FPJ')).toEqual([]);
  });

  it('keeps interchange and similarly named stations separate by rail line', () => {
    const lrtCubao = searchRailStations('lrt-2', 'Cubao');
    const mrtCubao = searchRailStations('mrt-3', 'Cubao');
    expect(lrtCubao).toHaveLength(1);
    expect(mrtCubao).toHaveLength(1);
    expect(lrtCubao[0]?.id).not.toBe(mrtCubao[0]?.id);
    expect(distanceM(lrtCubao[0]!, mrtCubao[0]!)).toBeGreaterThan(100);

    const lrtSantolan = searchRailStations('lrt-2', 'Santolan');
    const mrtSantolan = searchRailStations('mrt-3', 'Santolan');
    expect(lrtSantolan).toHaveLength(1);
    expect(mrtSantolan).toHaveLength(1);
    expect(distanceM(lrtSantolan[0]!, mrtSantolan[0]!)).toBeGreaterThan(1_000);

    expect(searchRailStations('lrt-1', 'Buendia')[0]?.id).toBe('lrt-1-gil-puyat');
    expect(searchRailStations('mrt-3', 'Buendia')[0]?.id).toBe('mrt-3-buendia');
  });

  it('normalizes punctuation, accents and optional line/station words for local search', () => {
    expect(searchRailStations('lrt-2', 'Betty Go Belmonte station')[0]?.id).toBe('lrt-2-betty-go-belmonte');
    expect(searchRailStations('lrt-2', 'lrt2 J. Ruiz')[0]?.id).toBe('lrt-2-j-ruiz');
    expect(searchRailStations('lrt-1', 'Paranaque Integrated Terminal Exchange')[0]?.id).toBe('lrt-1-pitx');
    expect(searchRailStations('unknown-line', '')).toEqual([]);
    expect(getRailStation(undefined)).toBeUndefined();
    expect(getRailStation('lrt1-1')).toBeUndefined();
  });

  it('keeps all points in the station area with plausible spacing along each line', () => {
    for (const station of railStations) {
      expect(Number.isFinite(station.latitude) && Number.isFinite(station.longitude)).toBe(true);
      expect(station.latitude).toBeGreaterThan(14.4);
      expect(station.latitude).toBeLessThan(14.75);
      expect(station.longitude).toBeGreaterThan(120.9);
      expect(station.longitude).toBeLessThan(121.2);
    }
    for (const line of railLines) {
      const stations = searchRailStations(line.id, '');
      for (let index = 1; index < stations.length; index += 1) {
        const distance = distanceM(stations[index - 1]!, stations[index]!);
        expect(distance).toBeGreaterThan(200);
        expect(distance).toBeLessThan(5_000);
      }
    }
    // Wikidata also has a deprecated V. Mapa longitude around 120.017; reject that regression.
    expect(getRailStation('lrt-2-v-mapa')?.longitude).toBe(121.01712);
  });

  it('retains a pinned, redistributable coordinate source for every catalog entry', () => {
    expect(RAIL_CATALOG_VERSION).toBe('2026-11-12.1');
    for (const station of railStations) {
      expect(station.sourceUrl).toMatch(/^https:\/\/www\.wikidata\.org\/w\/index\.php\?title=Q\d+&oldid=\d+#P625$/);
      expect(station.sourceLabel).toBe('Wikidata (CC0)');
      expect(station.reviewedAt).toBe('2026-11-12');
      expect(getRailStation(station.id)).toBe(station);
    }
  });
});
