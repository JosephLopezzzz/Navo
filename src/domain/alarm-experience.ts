import type { StoredAppState } from '../services/storage';
import { disarmDestinationAlarm } from './destination-alarm';
import { MAX_FUTURE_FIX_SKEW_MS } from './location-quality';
import type { DestinationAlarm, DestinationAlarmEvent, SavedDestination } from './models';

export const ALARM_ALERT_LIFETIME_MS = 5 * 60_000;

export interface AlarmAlertReference {
  alarmId: string;
  sessionId: string;
  eventId: string;
}

export interface CurrentAlarmAlert {
  alarm: DestinationAlarm;
  destination: SavedDestination;
  event: DestinationAlarmEvent;
}

export type AlarmAlertAction = 'present' | 'silence' | 'acknowledge' | 'complete' | 'end';
export type AlarmAlertActionOutcome = 'applied' | 'already-handled' | 'ended' | 'invalid-action';

function currentEvent(alarm: DestinationAlarm, event: DestinationAlarmEvent, now: number): boolean {
  return alarm.sessionId !== null && alarm.watchState !== 'off'
    && event.alarmId === alarm.id && event.destinationId === alarm.destinationId && event.sessionId === alarm.sessionId
    && Number.isFinite(event.occurredAt) && event.occurredAt >= 0
    && (alarm.armedAt === null || event.occurredAt >= alarm.armedAt)
    && event.occurredAt <= now + MAX_FUTURE_FIX_SKEW_MS && now - event.occurredAt <= ALARM_ALERT_LIFETIME_MS;
}

function compareEvents(first: DestinationAlarmEvent, second: DestinationAlarmEvent): number {
  const urgency = { approaching: 0, arrived: 1, missed: 2 };
  return urgency[second.stage] - urgency[first.stage] || second.occurredAt - first.occurredAt
    || (first.thresholdM ?? Infinity) - (second.thresholdM ?? Infinity);
}

/** Latest useful event per alarm; opening another alert never mutates a session. */
export function getCurrentAlarmAlerts(state: StoredAppState, now = Date.now()): CurrentAlarmAlert[] {
  const destinations = new Map(state.destinations.map((destination) => [destination.id, destination]));
  return state.destinationAlarms.flatMap((alarm) => {
    const destination = destinations.get(alarm.destinationId);
    if (!destination) return [];
    // firedAt remains after acknowledgment. It prevents a retained older screen
    // from becoming "current" again when its newer stage has been dismissed.
    const event = alarm.alertEvents.filter((item) => currentEvent(alarm, item, now)
      && (alarm.firedAt === null || item.occurredAt >= alarm.firedAt))
      .sort((first, second) => second.occurredAt - first.occurredAt || compareEvents(first, second))[0];
    return event ? [{ alarm, destination, event }] : [];
  }).sort((first, second) => compareEvents(first.event, second.event));
}

/** Exact lookup keeps an already displayed stage pinned while a newer one fires. */
export function getAlarmAlert(state: StoredAppState, reference: AlarmAlertReference, now = Date.now()): CurrentAlarmAlert | null {
  const alarm = state.destinationAlarms.find((item) => item.id === reference.alarmId && item.sessionId === reference.sessionId);
  const destination = alarm && state.destinations.find((item) => item.id === alarm.destinationId);
  const event = alarm?.alertEvents.find((item) => item.id === reference.eventId);
  return alarm && destination && event && currentEvent(alarm, event, now) ? { alarm, destination, event } : null;
}

/** Transaction reducer: all actions recheck the stored session and selected event. */
export function applyAlarmAlertAction(
  state: StoredAppState,
  reference: AlarmAlertReference,
  action: AlarmAlertAction,
  now = Date.now(),
): { state: StoredAppState; outcome: AlarmAlertActionOutcome } {
  const alarm = state.destinationAlarms.find((item) => item.id === reference.alarmId);
  if (!alarm || alarm.sessionId !== reference.sessionId || alarm.watchState === 'off'
    || !state.destinations.some((destination) => destination.id === alarm.destinationId)) return { state, outcome: 'ended' };
  const event = alarm.alertEvents.find((item) => item.id === reference.eventId);
  if (!event) return { state, outcome: 'already-handled' };
  if (!currentEvent(alarm, event, now)) return { state, outcome: 'ended' };
  if (action === 'complete' && event.stage !== 'arrived') return { state, outcome: 'invalid-action' };

  let updated: DestinationAlarm;
  if (action === 'present') {
    if (alarm.presentedEventIds.includes(event.id)) return { state, outcome: 'already-handled' };
    updated = { ...alarm, presentedEventIds: [...alarm.presentedEventIds, event.id].slice(-8) };
  } else if (action === 'silence') {
    const presented = alarm.presentedEventIds.includes(event.id);
    if (presented && !alarm.pendingEvents.some((item) => item.id === event.id)) return { state, outcome: 'already-handled' };
    // Leaving the screen ends its cue/retries, without acknowledging its visual
    // snapshot or suppressing a later stage in this destination session.
    updated = { ...alarm, pendingEvents: alarm.pendingEvents.filter((item) => item.id !== event.id),
      presentedEventIds: presented ? alarm.presentedEventIds : [...alarm.presentedEventIds, event.id].slice(-8) };
  } else if (action === 'acknowledge') {
    updated = { ...alarm, alertEvents: alarm.alertEvents.filter((item) => item.id !== event.id),
      pendingEvents: alarm.pendingEvents.filter((item) => item.id !== event.id) };
  } else if (action === 'complete' || action === 'end') {
    updated = disarmDestinationAlarm(alarm);
  } else {
    return { state, outcome: 'invalid-action' };
  }
  return { state: { ...state, destinationAlarms: state.destinationAlarms.map((item) => item.id === alarm.id ? updated : item) }, outcome: 'applied' };
}
