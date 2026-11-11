import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-sqlite', () => ({}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

import { createDestinationAlarm } from '../src/domain/destination-alarm';
import type { SavedDestination, TransitRoute, Trip } from '../src/domain/models';
import { removeSavedDestinations } from '../src/domain/saved-alarm-actions';
import { defaultAppState, type StoredAppState } from '../src/services/storage';

function destination(id: string): SavedDestination {
  return {
    id, name: id, latitude: 14.6, longitude: 121,
    kind: 'place', source: 'map-pin',
    createdAt: '2026-11-11T00:00:00.000Z', updatedAt: '2026-11-11T00:00:00.000Z',
  };
}

function savedState(): StoredAppState {
  return {
    ...defaultAppState,
    destinations: ['home', 'work', 'station'].map(destination),
    destinationAlarms: [
      createDestinationAlarm('home-alarm', 'home'),
      createDestinationAlarm('work-alarm', 'work'),
      { ...createDestinationAlarm('second-home-alarm', 'home'), enabled: true, notificationIdentifier: 'home-notification' },
      createDestinationAlarm('station-alarm', 'station'),
    ],
  };
}

describe('bulk saved alarm removal', () => {
  it('removes every alarm for selected destinations and keeps unselected alarms unchanged', () => {
    const current = savedState();
    const remainingAlarm = current.destinationAlarms[3];

    const updated = removeSavedDestinations(current, ['home', 'work', 'home']);

    expect(updated.destinations).toEqual([current.destinations[2]]);
    expect(updated.destinationAlarms).toEqual([remainingAlarm]);
    expect(updated.destinationAlarms[0]).toBe(remainingAlarm);
    expect(current.destinations).toHaveLength(3);
    expect(current.destinationAlarms).toHaveLength(4);
  });

  it('clears a permission notice for any alarm belonging to a removed destination', () => {
    const current = savedState();
    current.firstRun = { ...current.firstRun, permissionNoticeAlarmId: 'second-home-alarm' };

    const updated = removeSavedDestinations(current, ['home', 'work']);

    expect(updated.firstRun).toEqual({ ...current.firstRun, permissionNoticeAlarmId: null });
    expect(current.firstRun.permissionNoticeAlarmId).toBe('second-home-alarm');
  });

  it('retains the permission notice and all unrelated state when another destination is removed', () => {
    const current = savedState();
    const activeRoute: TransitRoute = {
      id: 'route', name: 'My bus route', mode: 'bus', direction: 'North',
      dataQuality: 'user-authored', coordinateStatus: 'missing', sourceLabel: 'Saved by rider',
      stops: [{ id: 'start', name: 'Start' }, { id: 'end', name: 'End' }],
    };
    const activeTrip: Trip = {
      id: 'trip', routeId: activeRoute.id, boardingIndex: 0, destinationIndex: 1,
      lastConfirmedIndex: 0, alertMode: 'destination-only', startedAt: '2026-11-11T00:00:00.000Z',
      status: 'active', approachedStopIds: [], arrivedStopIds: [], movingAwayCount: 0,
      directionAdvisorySent: false, offRouteCount: 0, routeDeviationSent: false,
    };
    Object.assign(current, {
      activeTrip, activeRoute, customBusRoutes: [activeRoute],
      lastLocationAt: 123, lastLocation: { latitude: 14.6, longitude: 121 }, lastLocationAccuracyM: 10,
      locationProblem: 'Waiting for GPS', lastTripNotice: 'Trip is active',
    });
    current.firstRun = { ...current.firstRun, permissionNoticeAlarmId: 'station-alarm' };
    current.importedAlarmSounds = [{
      id: 'imported:example-12345678', label: 'My sound', fileName: 'navo_imported_example-12345678.wav',
      durationSeconds: 10, sizeBytes: 100_000, createdAt: '2026-11-11T00:00:00.000Z',
    }];

    const updated = removeSavedDestinations(current, ['home']);

    const { destinations: beforeDestinations, destinationAlarms: beforeAlarms, ...beforeOther } = current;
    const { destinations: afterDestinations, destinationAlarms: afterAlarms, ...afterOther } = updated;
    expect(afterOther).toEqual(beforeOther);
    expect(updated.firstRun).toBe(current.firstRun);
    expect(updated.activeTrip).toBe(activeTrip);
    expect(updated.activeRoute).toBe(activeRoute);
    expect(updated.importedAlarmSounds).toBe(current.importedAlarmSounds);
    expect(afterDestinations).toHaveLength(beforeDestinations.length - 1);
    expect(afterAlarms).toHaveLength(beforeAlarms.length - 2);
  });

  it('removes all saved alarms without removing the imported sound library', () => {
    const current = savedState();

    const updated = removeSavedDestinations(current, current.destinations.map((item) => item.id));

    expect(updated.destinations).toEqual([]);
    expect(updated.destinationAlarms).toEqual([]);
    expect(updated.importedAlarmSounds).toBe(current.importedAlarmSounds);
  });

  it.each([{ ids: [] }, { ids: ['unknown'] }])('leaves state unchanged for a selection with no matching items: %j', ({ ids }) => {
    const current = savedState();
    expect(removeSavedDestinations(current, ids)).toBe(current);
  });
});
