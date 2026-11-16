import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { router, useGlobalSearchParams, usePathname, useRootNavigationState } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { getCurrentAlarmAlerts, type AlarmAlertReference } from '../domain/alarm-experience';
import { alarmAlertReferenceFromData } from '../domain/alarm-alert-reference';
import { consumeAlarmAlertIntent, getAlarmAlertIntent, queueAlarmAlertIntent, subscribeAlarmAlertIntent } from '../state/alarm-alert-intent';
import { useAppState } from '../state/AppStateProvider';

/** Hold explicit taps through hydration, then open one session-bound screen. */
export function AlarmAlertCoordinator({ ready }: { ready: boolean }) {
  const app = useAppState();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const navigation = useRootNavigationState();
  const intent = useSyncExternalStore(subscribeAlarmAlertIntent, getAlarmAlertIntent, getAlarmAlertIntent);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const opened = useRef(new Set<string>());
  const pendingNavigation = useRef<string | null>(null);

  useEffect(() => { pendingNavigation.current = null; }, [pathname, params.alarmId, params.sessionId, params.eventId]);

  useEffect(() => {
    const receiveResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const reference = alarmAlertReferenceFromData(response.notification.request.content.data);
      if (reference) queueAlarmAlertIntent(reference);
    };
    const responses = Notifications.addNotificationResponseReceivedListener(receiveResponse);
    try {
      // A current native tap already captured before hydration outranks an old
      // cached Expo response left from an earlier process.
      if (!getAlarmAlertIntent()) receiveResponse(Notifications.getLastNotificationResponse());
    } catch { /* Native startup may not have a response. */ }
    const lifecycle = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => { responses.remove(); lifecycle.remove(); };
  }, []);

  useEffect(() => {
    if (!ready || !active || !navigation?.key) return;
    const alerts = getCurrentAlarmAlerts(app);
    let target: AlarmAlertReference | null = null;
    if (intent) {
      const latest = alerts.find((item) => item.alarm.id === intent.alarmId && item.event.sessionId === intent.sessionId);
      target = latest ? { alarmId: latest.alarm.id, sessionId: latest.event.sessionId, eventId: latest.event.id } : intent;
      consumeAlarmAlertIntent(intent);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    } else {
      if (pathname.startsWith('/alarm/')) return;
      const next = alerts.find((item) => !item.alarm.presentedEventIds.includes(item.event.id)
        && !opened.current.has(JSON.stringify([item.alarm.id, item.event.sessionId, item.event.id])));
      if (next) target = { alarmId: next.alarm.id, sessionId: next.event.sessionId, eventId: next.event.id };
    }
    if (!target) return;
    const sameScreen = pathname === '/alarm/alert' && params.alarmId === target.alarmId
      && params.sessionId === target.sessionId && params.eventId === target.eventId;
    const key = JSON.stringify([target.alarmId, target.sessionId, target.eventId]);
    opened.current.add(key);
    if (sameScreen) return;
    if (pendingNavigation.current === key) return;
    pendingNavigation.current = key;
    if (opened.current.size > 64) opened.current.delete(opened.current.values().next().value!);
    const route = { pathname: '/alarm/alert' as const, params: { ...target } };
    if (pathname === '/alarm/alert') router.replace(route);
    else router.push(route);
  }, [ready, active, navigation?.key, intent, app, pathname, params]);

  return null;
}
