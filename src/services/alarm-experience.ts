import { applyAlarmAlertAction, getAlarmAlert, type AlarmAlertReference, type AlarmAlertAction } from '../domain/alarm-experience';
import { readAppState, updateAppState } from './storage';
import { dismissAlarmNotification } from './alarm-notification-delivery';
import { stopBackgroundLocationIfIdle } from './background-location';

/** Cancel the existing system cue; never start separate playback over OS settings. */
async function cancelTrustedCue(reference: AlarmAlertReference): Promise<void> {
  const results = await Promise.allSettled([
    dismissAlarmNotification(`navo-destination-${reference.eventId}`),
    dismissAlarmNotification(`navo-imported-${reference.eventId}`),
  ]);
  if (results.some((result) => result.status === 'rejected')) throw new Error('The alert could not be fully silenced. Dismiss its notification on your phone.');
}

export async function dismissAlarmAlertSound(reference: AlarmAlertReference): Promise<void> {
  // Closing the view is not acknowledgment, but it must prevent a queued cue
  // from starting after Back/background. The event stays available to reopen.
  let storageFailure: unknown;
  let authorized = false;
  try { await updateAppState((current) => {
    authorized = Boolean(getAlarmAlert(current, reference));
    return authorized ? applyAlarmAlertAction(current, reference, 'silence').state : current;
  }); }
  catch (error) {
    storageFailure = error;
    if (!authorized) {
      const current = await readAppState().catch(() => null);
      authorized = current !== null && getAlarmAlert(current, reference) !== null;
    }
  }
  if (authorized) await cancelTrustedCue(reference);
  if (storageFailure) throw new Error('The alert could not be fully silenced. Dismiss its notification on your phone.');
}

export async function handleAlarmAlertAction(reference: AlarmAlertReference, action: AlarmAlertAction) {
  let outcome: ReturnType<typeof applyAlarmAlertAction>['outcome'] = 'ended';
  let applied = false;
  let eventsToDismiss: AlarmAlertReference[] = [];
  await updateAppState((current) => {
    const alarm = current.destinationAlarms.find((item) => item.id === reference.alarmId && item.sessionId === reference.sessionId);
    const result = applyAlarmAlertAction(current, reference, action);
    outcome = result.outcome;
    applied = result.outcome === 'applied';
    if (result.outcome === 'applied' && action !== 'present') {
      eventsToDismiss = action === 'complete' || action === 'end'
        ? (alarm?.alertEvents ?? []).map((event) => ({ alarmId: event.alarmId, sessionId: event.sessionId, eventId: event.id })) : [reference];
    }
    return result.state;
  });
  // Persist first: a failed save must leave the action available to retry.
  const dismissals = await Promise.allSettled(eventsToDismiss.map(cancelTrustedCue));
  const failedCues = eventsToDismiss.filter((_, index) => dismissals[index].status === 'rejected');
  let trackingCleanupFailed = false;
  if (applied && (action === 'complete' || action === 'end')) {
    await stopBackgroundLocationIfIdle().catch(() => { trackingCleanupFailed = true; });
  }
  return {
    outcome, soundDismissalFailed: failedCues.length > 0, trackingCleanupFailed,
    // The event may now be acknowledged or the session complete. Retain only
    // this validated transaction's failed effects, not a new public authority.
    ...(failedCues.length ? { retrySilencing: async () => { await Promise.all(failedCues.map(cancelTrustedCue)); } } : {}),
  };
}

/** Notification intents carry identifiers, never authoritative location/event data. */
export { alarmAlertReferenceFromData } from '../domain/alarm-alert-reference';

