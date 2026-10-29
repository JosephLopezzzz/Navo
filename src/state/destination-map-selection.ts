import type { DestinationSource } from '../domain/models';

export interface DestinationMapSelection {
  latitude: number;
  longitude: number;
  name: string;
  subtitle: string;
  source: DestinationSource;
  providerPlaceId?: string;
}

let pendingSelection: DestinationMapSelection | null = null;

export function setPendingDestinationMapSelection(selection: DestinationMapSelection): void {
  pendingSelection = selection;
}

export function takePendingDestinationMapSelection(): DestinationMapSelection | null {
  const selection = pendingSelection;
  pendingSelection = null;
  return selection;
}

export function clearPendingDestinationMapSelection(): void {
  pendingSelection = null;
}
