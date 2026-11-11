import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-sqlite', () => ({}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

import { armDestinationAlarm, createDestinationAlarm } from '../src/domain/destination-alarm';
import { buildMonitoringNotification } from '../src/domain/monitoring-notification';
import type { SavedDestination } from '../src/domain/models';
import { defaultAppState, normalizeAppState, type StoredAppState } from '../src/services/storage';

const now = Date.parse('2026-11-12T05:08:00.000Z');
const destination: SavedDestination = {
  id: 'hospital', name: 'Chinese General Hospital & Medical Center', kind: 'bus-dropoff', source: 'map-pin',
  latitude: 14.6, longitude: 121, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
};
function stateWithLocation(distanceM = 12_600): StoredAppState {
  return {
    ...defaultAppState,
    destinations: [destination],
    destinationAlarms: [{ ...armDestinationAlarm(createDestinationAlarm('alarm', destination.id), 'session', now - 60_000), watchState: 'monitoring' }],
    lastLocation: { latitude: destination.latitude + distanceM / 111_195, longitude: destination.longitude },
    lastLocationAt: now, lastLocationAccuracyM: 10,
  };
}

describe('ongoing monitoring notification', () => {
  it('shows destination and a rounded local distance, with an absolute GPS time', () => {
    const content = buildMonitoringNotification(stateWithLocation(), now)!;
    expect(content.title).toBe(destination.name);
    expect(content.body).toContain('About 12.6 km away · Monitoring');
    expect(content.body).toContain('GPS ');
    expect(content.body).toContain('Straight-line estimate');
    expect(content.body).not.toContain('seconds ago');
    expect(content.expiresAt).toBe(now + 45_001);
  });

  it('does not substitute zero distance for a missing or pre-session location', () => {
    const state = stateWithLocation();
    for (const lastLocationAt of [null, now - 120_000]) {
      const content = buildMonitoringNotification({ ...state, lastLocationAt }, now)!;
      expect(content.body).toContain('Waiting for GPS');
      expect(content.body).not.toContain('0 m');
      expect(content.body).not.toContain('GPS ' + new Date(now).toLocaleTimeString());
      expect(content.expiresAt).toBeNull();
    }
  });

  it('labels stale coordinates last known rather than currently monitoring', () => {
    const state = stateWithLocation();
    state.destinationAlarms[0].armedAt = now - 120_000;
    state.lastLocationAt = now - 50_000;
    const content = buildMonitoringNotification(state, now)!;
    expect(content.body).toContain('Last known: About 12.6 km away');
    expect(content.body).toContain('Location update delayed');
    expect(content.expiresAt).toBeNull();
  });

  it('uses the retained reading time when a newer fix is unusable', () => {
    const state = stateWithLocation();
    state.destinationAlarms[0] = { ...state.destinationAlarms[0], lastDistanceM: 725, lastFixAt: now - 20_000 };
    state.lastLocationAt = now + 60_000;
    state.lastLocationAccuracyM = 500;
    state.locationProblem = 'GPS is weak.';
    const content = buildMonitoringNotification(state, now)!;
    expect(content.body).toContain('Last known: About 725 m away');
    expect(content.body).toContain(`GPS ${new Date(now - 20_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    expect(content.expiresAt).toBeNull();
  });

  it('follows the selected active alarm and falls back when it is disarmed or deleted', () => {
    const state = stateWithLocation();
    const other = { ...destination, id: 'station', name: 'Recto Station', kind: 'rail-station' as const };
    state.destinations.push(other);
    state.destinationAlarms.push(armDestinationAlarm(createDestinationAlarm('newer', other.id), 'newer-session', now - 10_000));
    expect(buildMonitoringNotification(state, now)!.title).toBe(other.name);
    state.settings = { ...state.settings, monitoringAlarmId: 'alarm' };
    expect(buildMonitoringNotification(state, now)!.title).toBe(destination.name);
    expect(buildMonitoringNotification(state, now)!.body).toContain('1 other alarm on');
    state.destinationAlarms[0].enabled = false;
    expect(buildMonitoringNotification(state, now)!.title).toBe(other.name);
    state.destinations = [other];
    expect(buildMonitoringNotification(state, now)!.title).toBe(other.name);
  });

  it('returns no service content for off alarms or unmapped manual trips', () => {
    expect(buildMonitoringNotification(defaultAppState, now)).toBeNull();
    const state = stateWithLocation();
    state.destinationAlarms[0].enabled = false;
    expect(buildMonitoringNotification(state, now)).toBeNull();
  });

  it('supports a mapped active route destination when no destination alarm is enabled', () => {
    const state = stateWithLocation(2_000);
    state.destinationAlarms = [];
    state.activeRoute = {
      id: 'route', name: 'My bus route', mode: 'bus', direction: 'North', dataQuality: 'user-authored',
      coordinateStatus: 'complete', sourceLabel: 'Rider saved', stops: [{ ...destination, name: 'Hospital stop' }],
    };
    state.activeTrip = {
      id: 'trip', routeId: 'route', boardingIndex: 0, destinationIndex: 0, lastConfirmedIndex: -1,
      alertMode: 'destination-only', status: 'active', startedAt: new Date(now - 30_000).toISOString(),
      approachedStopIds: [], arrivedStopIds: [], movingAwayCount: 0, directionAdvisorySent: false,
      offRouteCount: 0, routeDeviationSent: false,
    };
    const content = buildMonitoringNotification(state, now)!;
    expect(content.title).toBe('Hospital stop');
    expect(content.body).toContain('About 2.0 km away');
    expect(content.body).toContain('My bus route');
    state.activeRoute.coordinateStatus = 'missing';
    expect(buildMonitoringNotification(state, now)).toBeNull();
  });

  it('normalizes the optional display preference without changing existing alarms', () => {
    const state = stateWithLocation();
    const older = { ...state, settings: { ...state.settings, monitoringAlarmId: undefined } };
    expect(normalizeAppState(older).settings.monitoringAlarmId).toBeNull();
    expect(normalizeAppState({ ...state, settings: { monitoringAlarmId: 3 } }).settings.monitoringAlarmId).toBeNull();
    const saved = normalizeAppState({ ...state, settings: { ...state.settings, monitoringAlarmId: 'alarm' } });
    expect(saved.settings.monitoringAlarmId).toBe('alarm');
    expect(saved.destinationAlarms).toEqual(state.destinationAlarms);
  });
});
