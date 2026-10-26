import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPendingDestinationMapSelection,
  setPendingDestinationMapSelection,
  takePendingDestinationMapSelection,
  type DestinationMapSelection,
} from '../src/state/destination-map-selection';

const selectedPlace: DestinationMapSelection = {
  latitude: 14.6042,
  longitude: 120.9822,
  name: 'Recto Station',
  subtitle: 'Manila',
  source: 'tomtom',
  providerPlaceId: 'place-123',
};

describe('destination map selection handoff', () => {
  beforeEach(clearPendingDestinationMapSelection);

  it('returns a selection once so the destination form can consume it', () => {
    setPendingDestinationMapSelection(selectedPlace);

    expect(takePendingDestinationMapSelection()).toEqual(selectedPlace);
    expect(takePendingDestinationMapSelection()).toBeNull();
  });

  it('clears a stale selection before opening the map again', () => {
    setPendingDestinationMapSelection(selectedPlace);
    clearPendingDestinationMapSelection();

    expect(takePendingDestinationMapSelection()).toBeNull();
  });
});
