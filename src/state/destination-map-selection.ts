import type { DestinationSource, RailStationReference } from '../domain/models';

export interface DestinationMapSelection {
  latitude: number;
  longitude: number;
  name: string;
  subtitle: string;
  source: DestinationSource;
  providerPlaceId?: string;
  railStation?: RailStationReference;
  railRequestId?: string;
}

let pendingSelection: DestinationMapSelection | null = null;

export function setPendingDestinationMapSelection(selection: DestinationMapSelection): void {
  pendingSelection = selection;
}

export function takePendingDestinationMapSelection(expectedRail?: { railRequestId: string; stationId: string }): DestinationMapSelection | null {
  const selection = pendingSelection;
  pendingSelection = null;
  if (expectedRail) {
    if (selection?.railRequestId !== expectedRail.railRequestId
      || selection.railStation?.stationId !== expectedRail.stationId
      || selection.source !== 'rail-catalog') return null;
  } else if (selection?.railRequestId || selection?.source === 'rail-catalog') {
    return null;
  }
  return selection;
}

export function clearPendingDestinationMapSelection(): void {
  pendingSelection = null;
}
