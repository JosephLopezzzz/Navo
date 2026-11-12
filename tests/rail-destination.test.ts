import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RailStationReference, SavedDestination } from '../src/domain/models';
import { normalizeRailDestinationMetadata } from '../src/domain/rail-destination';
import { clearPendingDestinationMapSelection, setPendingDestinationMapSelection, takePendingDestinationMapSelection } from '../src/state/destination-map-selection';
import { defaultAppState, normalizeAppState } from '../src/services/storage';

vi.mock('expo-sqlite', () => ({}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

const reference: RailStationReference = {
  stationId: 'lrt-1-fernando-poe-jr', lineId: 'lrt-1', catalogVersion: 'older-catalog',
  coordinateSourceUrl: 'https://www.wikidata.org/wiki/Q7366465', reviewedAt: '2026-11-12',
};
const saved: SavedDestination = {
  id: 'existing', name: 'My commute', latitude: 14.657, longitude: 121.02,
  kind: 'rail-station', source: 'tomtom', createdAt: '2026-10-01', updatedAt: '2026-10-02',
};

describe('saved rail identity', () => {
  it('keeps old saved points and editable labels without inferring a station', () => {
    expect(normalizeRailDestinationMetadata({ ...saved, name: 'Fernando Poe Jr.' })).toEqual({ ...saved, name: 'Fernando Poe Jr.' });
  });

  it('retains the coordinate snapshot and older catalog provenance on reload', () => {
    const destination = { ...saved, source: 'rail-catalog' as const, railStation: reference };
    expect(normalizeRailDestinationMetadata(JSON.parse(JSON.stringify(destination)))).toEqual(destination);
  });

  it('loads both legacy and catalog destinations through persisted app state without moving them', () => {
    const catalogDestination = { ...saved, id: 'catalog', source: 'rail-catalog' as const, railStation: reference };
    const diskState = JSON.parse(JSON.stringify({ ...defaultAppState, schemaVersion: 4, destinations: [saved, catalogDestination] }));
    expect(normalizeAppState(diskState).destinations).toEqual([saved, catalogDestination]);
  });

  it('removes malformed or non-rail metadata without moving the saved location', () => {
    const destination = normalizeRailDestinationMetadata({ ...saved, source: 'rail-catalog', railStation: { ...reference, lineId: 'unknown' as 'lrt-1' } });
    expect(destination).toEqual({ ...saved, source: 'map-pin' });
    expect(normalizeRailDestinationMetadata({ ...saved, kind: 'place', railStation: reference }).railStation).toBeUndefined();
  });
});

describe('station map handoff', () => {
  beforeEach(clearPendingDestinationMapSelection);
  const selection = { latitude: 14.657, longitude: 121.02, name: 'Fernando Poe Jr. Station', subtitle: 'LRT-1', source: 'rail-catalog' as const, railStation: reference, railRequestId: 'request-1' };

  it('accepts a matching confirmation once', () => {
    setPendingDestinationMapSelection(selection);
    const expected = { railRequestId: 'request-1', stationId: reference.stationId };
    expect(takePendingDestinationMapSelection(expected)).toEqual(selection);
    expect(takePendingDestinationMapSelection(expected)).toBeNull();
  });

  it('rejects an earlier visit or a different station', () => {
    setPendingDestinationMapSelection(selection);
    expect(takePendingDestinationMapSelection({ railRequestId: 'request-2', stationId: reference.stationId })).toBeNull();
    setPendingDestinationMapSelection(selection);
    expect(takePendingDestinationMapSelection({ railRequestId: 'request-1', stationId: 'lrt-1-balintawak' })).toBeNull();
  });

  it('cannot consume a rail selection in a generic picker', () => {
    setPendingDestinationMapSelection(selection);
    expect(takePendingDestinationMapSelection()).toBeNull();
    setPendingDestinationMapSelection({ latitude: 14.6, longitude: 121, name: 'Home', subtitle: '', source: 'map-pin' });
    expect(takePendingDestinationMapSelection()?.name).toBe('Home');
  });
});
