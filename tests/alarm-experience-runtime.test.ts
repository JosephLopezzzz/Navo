import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { armDestinationAlarm, createDestinationAlarm } from '../src/domain/destination-alarm';
import type { DestinationAlarmEvent, SavedDestination } from '../src/domain/models';
import type { StoredAppState } from '../src/services/storage';

const mocks = vi.hoisted(() => ({ update: vi.fn(), read: vi.fn(), dismiss: vi.fn(), stop: vi.fn() }));
vi.mock('../src/services/storage', () => ({ updateAppState: mocks.update, readAppState: mocks.read }));
vi.mock('../src/services/alarm-notification-delivery', () => ({ dismissAlarmNotification: mocks.dismiss }));
vi.mock('../src/services/background-location', () => ({ stopBackgroundLocationIfIdle: mocks.stop }));
import { alarmAlertReferenceFromData, dismissAlarmAlertSound, handleAlarmAlertAction } from '../src/services/alarm-experience';

const NOW = 1_000_000;
const destination: SavedDestination = { id: 'stop', name: 'My stop', latitude: 14.6, longitude: 121, kind: 'place', source: 'map-pin', createdAt: '', updatedAt: '' };
const event: DestinationAlarmEvent = { id: 'session:arrived', alarmId: 'alarm', destinationId: 'stop', sessionId: 'session', stage: 'arrived', occurredAt: NOW, distanceM: 40, message: 'Destination area reached.' };
const reference = { alarmId: event.alarmId, sessionId: event.sessionId, eventId: event.id };
let state: StoredAppState;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const alarm = armDestinationAlarm(createDestinationAlarm('alarm', 'stop'), 'session', NOW - 60_000);
  state = { destinationAlarms: [{ ...alarm, watchState: 'monitoring', alertEvents: [event], pendingEvents: [event], firedAt: NOW }], destinations: [destination], activeTrip: { id: 'other-trip' } } as StoredAppState;
  mocks.update.mockImplementation(async (mutate: (current: StoredAppState) => StoredAppState) => { state = mutate(state); return state; });
  mocks.read.mockImplementation(async () => state);
  mocks.dismiss.mockResolvedValue(undefined);
  mocks.stop.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('alarm-screen effects', () => {
  it('persists completion before silencing, preserving unrelated route work', async () => {
    mocks.dismiss.mockImplementation(async () => { expect(state.destinationAlarms[0].enabled).toBe(false); });
    const route = state.activeTrip;
    const result = await handleAlarmAlertAction(reference, 'complete');
    expect(result).toEqual({ outcome: 'applied', soundDismissalFailed: false, trackingCleanupFailed: false });
    expect(state.activeTrip).toBe(route);
    expect(mocks.dismiss).toHaveBeenCalledWith(`navo-destination-${event.id}`);
    expect(mocks.dismiss).toHaveBeenCalledWith(`navo-imported-${event.id}`);
    expect(mocks.stop).toHaveBeenCalledOnce();
  });

  it('leaves the current event and audio available to retry when the action save fails', async () => {
    mocks.update.mockRejectedValueOnce(new Error('Storage full'));
    await expect(handleAlarmAlertAction(reference, 'complete')).rejects.toThrow('Storage full');
    expect(state.destinationAlarms[0].enabled).toBe(true);
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it('reports native cleanup failures without claiming the completed alarm is still on', async () => {
    mocks.stop.mockRejectedValueOnce(new Error('Native cleanup failed'));
    mocks.dismiss.mockRejectedValueOnce(new Error('Dismiss failed'));
    const result = await handleAlarmAlertAction(reference, 'complete');
    expect(result.outcome).toBe('applied');
    expect(result.soundDismissalFailed).toBe(true);
    expect(result.trackingCleanupFailed).toBe(true);
    expect(state.destinationAlarms[0].enabled).toBe(false);
  });

  it('retries only the transaction-authorized failed cue after its event is removed', async () => {
    mocks.dismiss.mockRejectedValueOnce(new Error('Temporary native failure'));
    const result = await handleAlarmAlertAction(reference, 'complete');
    expect(state.destinationAlarms[0].alertEvents).toEqual([]);
    expect(result.soundDismissalFailed).toBe(true);
    expect(result.retrySilencing).toBeTypeOf('function');
    mocks.dismiss.mockClear();
    await result.retrySilencing!();
    expect(mocks.dismiss).toHaveBeenCalledWith(`navo-destination-${event.id}`);
    expect(mocks.dismiss).toHaveBeenCalledWith(`navo-imported-${event.id}`);
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it('closing silences a queued cue without acknowledging or ending the destination', async () => {
    mocks.dismiss.mockImplementation(async () => { expect(state.destinationAlarms[0].pendingEvents).toEqual([]); });
    await dismissAlarmAlertSound(reference);
    expect(state.destinationAlarms[0].alertEvents).toEqual([event]);
    expect(state.destinationAlarms[0].presentedEventIds).toContain(event.id);
    expect(state.destinationAlarms[0].enabled).toBe(true);
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it('does not mutate or reconcile another armed session from an old screen action', async () => {
    const original = state;
    const result = await handleAlarmAlertAction({ ...reference, sessionId: 'old-session' }, 'end');
    expect(result.outcome).toBe('ended');
    expect(state).toBe(original);
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it('still tries to stop the audible cue if close-only persistence fails', async () => {
    mocks.update.mockRejectedValueOnce(new Error('Storage full'));
    await expect(dismissAlarmAlertSound(reference)).rejects.toThrow('fully silenced');
    expect(mocks.dismiss).toHaveBeenCalledTimes(2);
  });

  it('does not silence a real event using a forged alarm or session reference', async () => {
    await dismissAlarmAlertSound({ ...reference, alarmId: 'another-alarm' });
    await dismissAlarmAlertSound({ ...reference, sessionId: 'old-session' });
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(state.destinationAlarms[0].pendingEvents).toEqual([event]);
  });

  it('accepts bounded notification identity fields and rejects malformed inputs', () => {
    expect(alarmAlertReferenceFromData(reference)).toEqual(reference);
    expect(alarmAlertReferenceFromData({ destinationAlarmId: 'alarm', sessionId: 'session', eventId: event.id })).toEqual(reference);
    for (const data of [null, {}, { ...reference, eventId: ['one', 'two'] }, { ...reference, sessionId: '' }, { ...reference, alarmId: 'a'.repeat(241) }]) {
      expect(alarmAlertReferenceFromData(data)).toBeNull();
    }
  });
});
