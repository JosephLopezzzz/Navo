import { describe, expect, it } from 'vitest';
import { railStations, searchRailStations, type RailLineId } from '../src/data/rail-stations';
import { createRailDiagramLayout, getRailDiagramStations } from '../src/components/rail-diagram-layout';

const lines: RailLineId[] = ['lrt-1', 'lrt-2', 'mrt-3'];
const endpoints = {
  'lrt-1': ['lrt-1-fernando-poe-jr', 'lrt-1-dr-santos', 25],
  'lrt-2': ['lrt-2-recto', 'lrt-2-antipolo', 13],
  'mrt-3': ['mrt-3-north-avenue', 'mrt-3-taft-avenue', 13],
} as const;

function layoutFor(lineId: RailLineId, width = 360, fontScale = 1) {
  const stations = getRailDiagramStations(lineId, searchRailStations(lineId, ''));
  return createRailDiagramLayout({ lineId, stations, width, fontScale });
}

describe('rail schematic destination presentation', () => {
  it.each(lines)('includes each %s station once with the approved endpoints without changing stored records', (lineId) => {
    const input = searchRailStations(lineId, '');
    const originalIds = input.map((station) => station.id);
    const originalCatalog = JSON.stringify(railStations);
    const ordered = getRailDiagramStations(lineId, input);
    const [first, last, count] = endpoints[lineId];
    expect(ordered).toHaveLength(count);
    expect(new Set(ordered.map((station) => station.id)).size).toBe(count);
    expect(ordered[0]?.id).toBe(first);
    expect(ordered.at(-1)?.id).toBe(last);
    expect(input.map((station) => station.id)).toEqual(originalIds);
    expect(JSON.stringify(railStations)).toBe(originalCatalog);
    for (const station of ordered) expect(input).toContain(station);
  });

  it('retains line identity and diagram order in searched interchange results', () => {
    const lrt = getRailDiagramStations('lrt-2', searchRailStations('lrt-2', 'Cubao'));
    const mrt = getRailDiagramStations('mrt-3', searchRailStations('mrt-3', 'Cubao'));
    expect(lrt).toHaveLength(1);
    expect(mrt).toHaveLength(1);
    expect(lrt[0]?.id).not.toBe(mrt[0]?.id);
    const stations = getRailDiagramStations('lrt-2', searchRailStations('lrt-2', 'a'));
    const wholeIds = getRailDiagramStations('lrt-2', searchRailStations('lrt-2', '')).map((station) => station.id);
    expect(stations.map((station) => station.id)).toEqual(wholeIds.filter((id) => stations.some((station) => station.id === id)));
    const result = createRailDiagramLayout({ lineId: 'lrt-2', stations, width: 320, searchResults: true });
    expect(result.connectorPath).toBe('');
    expect(result.nodes.map((node) => node.stationId)).toEqual(stations.map((station) => station.id));
  });

  it('preserves each line\'s distinct bends and station sequence', () => {
    const lrt1 = layoutFor('lrt-1');
    const [fpj, balintawak, monumento, fifth] = lrt1.nodes;
    expect(fpj!.x).toBeGreaterThan(balintawak!.x);
    expect(balintawak!.x).toBeGreaterThan(monumento!.x);
    expect(fpj!.y).toBe(balintawak!.y);
    expect(balintawak!.y).toBe(monumento!.y);
    expect(fifth!.y).toBeGreaterThan(monumento!.y);

    const lrt2 = layoutFor('lrt-2');
    const katipunan = lrt2.nodes.find((node) => node.stationId === 'lrt-2-katipunan')!;
    const santolan = lrt2.nodes.find((node) => node.stationId === 'lrt-2-santolan')!;
    const marikina = lrt2.nodes.find((node) => node.stationId === 'lrt-2-marikina-pasig')!;
    const antipolo = lrt2.nodes.at(-1)!;
    expect(katipunan.x).toBeGreaterThan(santolan.x);
    expect(antipolo.x).toBeGreaterThan(marikina.x);

    const mrt3 = layoutFor('mrt-3');
    const ortigas = mrt3.nodes.find((node) => node.stationId === 'mrt-3-ortigas')!;
    expect(ortigas.x).toBeGreaterThan(mrt3.nodes[0]!.x);
    expect(ortigas.x).toBeGreaterThan(mrt3.nodes.at(-1)!.x);
    for (const result of [lrt1, lrt2, mrt3]) {
      expect(result.connectorPath).toMatch(/^M/);
      expect(result.connectorPath).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it.each(lines)('keeps %s labels and station touch regions bounded at small widths and enlarged text', (lineId) => {
    for (const width of [280, 320, 600]) {
      for (const fontScale of [1, 1.6, 2]) {
        const result = layoutFor(lineId, width, fontScale);
        expect(result.width).toBe(width);
        expect(Number.isFinite(result.height)).toBe(true);
        for (const node of result.nodes) {
          expect(node.x).toBeGreaterThanOrEqual(0);
          expect(node.x).toBeLessThanOrEqual(width);
          for (const bounds of [node.label, node.target]) {
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.y).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 0.01);
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(result.height + 0.01);
          }
          expect(node.target.width).toBeGreaterThanOrEqual(48);
          expect(node.target.height).toBeGreaterThanOrEqual(48);
        }
        for (let a = 0; a < result.nodes.length; a += 1) {
          for (let b = a + 1; b < result.nodes.length; b += 1) {
            const first = result.nodes[a]!.target;
            const second = result.nodes[b]!.target;
            const overlapX = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
            const overlapY = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
            expect(overlapX > 0.01 && overlapY > 0.01).toBe(false);
          }
        }
      }
    }
  });

  it('reserves additional space for a measured multiline label without losing station identity', () => {
    const lineId = 'mrt-3';
    const stations = getRailDiagramStations(lineId, searchRailStations(lineId, ''));
    const initial = createRailDiagramLayout({ lineId, stations, width: 320 });
    const expanded = createRailDiagramLayout({ lineId, stations, width: 320, labelHeights: { 'mrt-3-santolan-annapolis': 160 } });
    expect(expanded.nodes.map((node) => node.stationId)).toEqual(initial.nodes.map((node) => node.stationId));
    expect(expanded.height).toBeGreaterThan(initial.height);
    const label = expanded.nodes.find((node) => node.stationId === 'mrt-3-santolan-annapolis')!.label;
    expect(label.height).toBeGreaterThanOrEqual(160);
  });

  it('stacks the opening stations in route order for screen readers without changing their identities', () => {
    const stations = getRailDiagramStations('lrt-1', searchRailStations('lrt-1', ''));
    const result = createRailDiagramLayout({ lineId: 'lrt-1', stations, width: 360, stackTopStations: true });
    expect(result.nodes.map((node) => node.stationId)).toEqual(stations.map((station) => station.id));
    expect(result.nodes[0]!.y).toBeLessThan(result.nodes[1]!.y);
    expect(result.nodes[1]!.y).toBeLessThan(result.nodes[2]!.y);
  });

  it('centers a measured short label beside its node instead of retaining an oversized estimate', () => {
    const stations = getRailDiagramStations('mrt-3', searchRailStations('mrt-3', ''));
    const stationId = 'mrt-3-santolan-annapolis';
    const result = createRailDiagramLayout({ lineId: 'mrt-3', stations, width: 320, labelHeights: { [stationId]: 20 } });
    const node = result.nodes.find((item) => item.stationId === stationId)!;
    expect(node.label.height).toBe(20);
    expect(node.label.y + node.label.height / 2).toBe(node.y);
    expect(node.target.height).toBeGreaterThanOrEqual(48);
  });
});
