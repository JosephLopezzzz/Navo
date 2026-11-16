import type { AlarmAlertReference } from './alarm-experience';

export function alarmAlertReferenceFromData(value: unknown): AlarmAlertReference | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const alarmId = data.alarmId ?? data.destinationAlarmId;
  const { sessionId, eventId } = data;
  if (![alarmId, sessionId, eventId].every((item) => typeof item === 'string' && item.length > 0 && item.length <= 240)) return null;
  return { alarmId: alarmId as string, sessionId: sessionId as string, eventId: eventId as string };
}

export function alarmAlertReferenceFromUrl(path: string | null): AlarmAlertReference | null {
  if (!path || path.length > 2048) return null;
  try {
    const url = new URL(path, 'navo://navo');
    if (url.protocol !== 'navo:' || !((url.hostname === 'alarm' && url.pathname === '/alert')
      || (url.hostname === 'navo' && url.pathname === '/alarm/alert'))) return null;
    const fields = ['alarmId', 'sessionId', 'eventId'];
    if (fields.some((field) => url.searchParams.getAll(field).length !== 1)) return null;
    return alarmAlertReferenceFromData(Object.fromEntries(fields.map((field) => [field, url.searchParams.get(field)])));
  } catch { return null; }
}
