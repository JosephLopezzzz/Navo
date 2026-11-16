import { alarmAlertReferenceFromUrl } from '../domain/alarm-alert-reference';
import { queueAlarmAlertIntent } from '../state/alarm-alert-intent';

/** The coordinator alone navigates alarm taps after storage/first-run gates. */
export function redirectSystemPath({ path }: { path: string | null; initial: boolean }) {
  const reference = alarmAlertReferenceFromUrl(path);
  if (!reference) return path;
  queueAlarmAlertIntent(reference);
  return null;
}
