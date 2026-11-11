import type { StoredAppState } from '../services/storage';

/** Remove saved destinations and their alarms in the same state transaction. */
export function removeSavedDestinations(current: StoredAppState, destinationIds: readonly string[]): StoredAppState {
  const selectedIds = new Set(destinationIds);
  if (selectedIds.size === 0) return current;

  const removedAlarms = current.destinationAlarms.filter((alarm) => selectedIds.has(alarm.destinationId));
  const destinations = current.destinations.filter((destination) => !selectedIds.has(destination.id));
  if (destinations.length === current.destinations.length && removedAlarms.length === 0) return current;

  return {
    ...current,
    destinations,
    destinationAlarms: current.destinationAlarms.filter((alarm) => !selectedIds.has(alarm.destinationId)),
    firstRun: removedAlarms.some((alarm) => alarm.id === current.firstRun.permissionNoticeAlarmId)
      ? { ...current.firstRun, permissionNoticeAlarmId: null }
      : current.firstRun,
  };
}
