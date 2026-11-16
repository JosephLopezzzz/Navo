import type { AlarmAlertReference } from '../domain/alarm-experience';

let pending: AlarmAlertReference | null = null;
const listeners = new Set<() => void>();

export const getAlarmAlertIntent = () => pending;
export function subscribeAlarmAlertIntent(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function queueAlarmAlertIntent(reference: AlarmAlertReference) {
  if (pending?.alarmId === reference.alarmId && pending.sessionId === reference.sessionId && pending.eventId === reference.eventId) return;
  pending = reference;
  for (const listener of listeners) { try { listener(); } catch { /* Another observer can still consume the tap. */ } }
}
export function consumeAlarmAlertIntent(reference: AlarmAlertReference) {
  if (pending !== reference) return;
  pending = null;
  for (const listener of listeners) { try { listener(); } catch { /* Routing must not crash on observer failure. */ } }
}
