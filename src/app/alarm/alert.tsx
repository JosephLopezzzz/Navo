import { useCallback, useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { AccessibilityInfo, ActivityIndicator, Alert, AppState, findNodeHandle, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavoPressable } from '../../components/NavoPressable';
import { formatAlarmDistance, getAlarmDistancePresentation } from '../../domain/alarm-distance-presentation';
import { getAlarmAlert, getCurrentAlarmAlerts, type AlarmAlertReference } from '../../domain/alarm-experience';
import { useScreenActionScope } from '../../hooks/useScreenActionScope';
import { dismissAlarmAlertSound, handleAlarmAlertAction } from '../../services/alarm-experience';
import { useAppState } from '../../state/AppStateProvider';
import { useLiveLocation } from '../../state/live-location';
import { useNavoColors } from '../../theme/colors';

type RouteParams = { alarmId?: string; sessionId?: string; eventId?: string };
type AlertAction = 'acknowledge' | 'complete' | 'end';
type ActionSource = 'primary' | 'mute' | 'end';

export default function AlarmAlertRoute() {
  const params = useLocalSearchParams<RouteParams>();
  const reference = useMemo<AlarmAlertReference | null>(() => typeof params.alarmId === 'string'
    && typeof params.sessionId === 'string' && typeof params.eventId === 'string'
    && params.alarmId && params.sessionId && params.eventId
    ? { alarmId: params.alarmId, sessionId: params.sessionId, eventId: params.eventId } : null,
  [params.alarmId, params.sessionId, params.eventId]);
  return <AlarmAlertContent key={reference ? `${reference.alarmId}:${reference.sessionId}:${reference.eventId}` : 'unavailable'} reference={reference} />;
}

function AlarmAlertContent({ reference }: { reference: AlarmAlertReference | null }) {
  const app = useAppState();
  const reading = useLiveLocation();
  const colors = useNavoColors();
  const focused = useIsFocused();
  const captureAction = useScreenActionScope();
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState<ActionSource | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [cleanupProblem, setCleanupProblem] = useState(false);
  const [checkedDestinationId, setCheckedDestinationId] = useState<string | null>(null);
  const [presentAttempt, setPresentAttempt] = useState(0);
  const operation = useRef(false);
  const confirmationOpen = useRef(false);
  const cleanupRetry = useRef<(() => Promise<void>) | null>(null);
  const heading = useRef<ElementRef<typeof Text>>(null);
  const announced = useRef(false);
  const current = app.ready && reference ? getAlarmAlert(app, reference, now) : null;
  const others = app.ready ? getCurrentAlarmAlerts(app, now).filter((item) => item.event.id !== reference?.eventId
    || item.alarm.id !== reference?.alarmId || item.event.sessionId !== reference?.sessionId) : [];
  const hasCurrent = Boolean(current);
  const eventId = reference?.eventId;

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  useFocusEffect(useCallback(() => {
    announced.current = false;
    setNow(Date.now());
    let timer: ReturnType<typeof setInterval> | null = null;
    const update = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (AppState.currentState === 'active') {
        setNow(Date.now());
        timer = setInterval(() => setNow(Date.now()), 5_000);
      } else if (reference) void dismissAlarmAlertSound(reference).catch(() => undefined);
    };
    update();
    const subscription = AppState.addEventListener('change', update);
    return () => {
      subscription.remove();
      if (timer !== null) clearInterval(timer);
      if (reference) void dismissAlarmAlertSound(reference).catch(() => undefined);
    };
  }, [reference]));

  useEffect(() => {
    if (!focused || !app.ready || !reference || !hasCurrent) return;
    let active = true;
    void handleAlarmAlertAction(reference, 'present').catch(() => {
      if (active) setProblem('Navo could not save that this alert was opened. Retry saved data before leaving it.');
    });
    return () => { active = false; };
  }, [focused, app.ready, reference, hasCurrent, presentAttempt]);

  useEffect(() => {
    if (!focused || !hasCurrent) return;
    const frame = requestAnimationFrame(() => {
      if (announced.current) return;
      const target = findNodeHandle(heading.current);
      if (typeof target === 'number') {
        AccessibilityInfo.setAccessibilityFocus(target);
        announced.current = true;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [focused, hasCurrent, eventId]);

  useEffect(() => {
    if (app.ready && !hasCurrent && reference) void dismissAlarmAlertSound(reference).catch(() => undefined);
  }, [app.ready, hasCurrent, reference]);

  const retry = async () => {
    if (operation.current) return;
    setProblem(null);
    await app.refreshState();
    setPresentAttempt((attempt) => attempt + 1);
  };

  const act = async (action: AlertAction, source: ActionSource, visit = captureAction()) => {
    if (!visit() || operation.current || !reference || !current) return;
    const destinationId = current.destination.id;
    operation.current = true;
    setBusy(source);
    setProblem(null);
    try {
      const result = await handleAlarmAlertAction(reference, action);
      if (!visit()) return;
      if (result.outcome === 'ended' || result.outcome === 'invalid-action') {
        setProblem('This alert has ended. Return to your alarms to check the current trip.');
        await app.refreshState();
        return;
      }
      if (result.soundDismissalFailed) {
        cleanupRetry.current = result.retrySilencing ?? null;
        setCleanupProblem(true);
        if (source === 'primary' && current.event.stage === 'missed') setCheckedDestinationId(destinationId);
        setProblem('Your action was saved, but the phone’s alert could not be silenced. Retry or dismiss its notification on your phone.');
        await app.refreshState();
        return;
      }
      if (result.trackingCleanupFailed) {
        setProblem('This alarm ended. Location cleanup will retry when Navo resumes.');
        await app.refreshState();
        return;
      }
      if (source === 'primary' && current.event.stage === 'missed') {
        router.replace({ pathname: '/alarm/destination', params: { destinationId } });
      } else close();
    } catch {
      if (visit()) setProblem('Navo could not save this action. This alarm may still be on. Try again.');
    } finally {
      operation.current = false;
      if (visit()) setBusy(null);
    }
  };

  const retrySilencing = async () => {
    const visit = captureAction();
    if (!visit() || operation.current || !reference) return;
    operation.current = true;
    setBusy('mute');
    try {
      if (cleanupRetry.current) await cleanupRetry.current();
      else await dismissAlarmAlertSound(reference);
      if (!visit()) return;
      cleanupRetry.current = null;
      setCleanupProblem(false);
      setProblem(null);
      if (checkedDestinationId) router.replace({ pathname: '/alarm/destination', params: { destinationId: checkedDestinationId } });
      else close();
    } catch {
      if (visit()) setProblem('The phone’s alert could not be silenced. Dismiss its notification on your phone or try again.');
    } finally {
      operation.current = false;
      if (visit()) setBusy(null);
    }
  };

  const confirmEnd = () => {
    const visit = captureAction();
    if (!visit() || operation.current || confirmationOpen.current || !current) return;
    confirmationOpen.current = true;
    Alert.alert('End this destination alarm?', `Later alerts for ${current.destination.name} will stop. Other alarms and your route trip stay on.`, [
      { text: 'Keep tracking', style: 'cancel', onPress: () => { confirmationOpen.current = false; } },
      { text: 'End this alarm', style: 'destructive', onPress: () => { confirmationOpen.current = false; if (visit()) void act('end', 'end', visit); } },
    ], { cancelable: true, onDismiss: () => { confirmationOpen.current = false; } });
  };

  const nextAlert = () => {
    if (operation.current || !others.length) return;
    const next = others[0]!;
    router.replace({ pathname: '/alarm/alert', params: { alarmId: next.alarm.id, sessionId: next.event.sessionId, eventId: next.event.id } });
  };

  const stage = current?.event.stage;
  const stageColor = stage === 'missed' ? colors.warning : colors.teal;
  const title = stage === 'missed' ? 'You may have\npassed your stop.'
    : stage === 'arrived' ? 'You’re at your\ndestination.' : 'Your stop\nis close.';
  const primaryTitle = stage === 'missed' ? 'Check destination' : stage === 'arrived' ? 'I’m here' : 'I’m getting off';
  const guidance = stage === 'missed' ? 'Check your stop and choose a safe next step.'
    : stage === 'arrived' ? 'Check your surroundings before getting off.' : 'Get ready to leave when it is safe.';
  const helper = stage === 'missed' ? 'Opens your saved destination'
    : stage === 'arrived' ? 'Confirms this destination is complete' : 'Later alerts stay on';
  const presentation = current ? getAlarmDistancePresentation(current.destination, current.alarm, reading, now) : null;
  const locationProblem = current?.alarm.enabled && presentation
    && ['weak-gps', 'delayed', 'unavailable', 'locating'].includes(presentation.status) ? presentation.detail : null;
  const distanceLabel = stage === 'arrived' ? 'Destination area reached'
    : presentation?.distanceLabel ?? (current ? `At alert: ${formatAlarmDistance(current.event.distanceM)}` : 'Distance unavailable');
  const alertTime = current ? new Date(current.event.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const context = current?.destination.subtitle || (current?.destination.kind === 'rail-station'
    ? `${current.destination.railStation?.lineId.toUpperCase() ?? 'Rail'} · Station`
    : current?.destination.kind === 'bus-dropoff' ? 'Bus stop or area' : 'Saved place');
  const shownProblem = problem ?? app.storageProblem;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.header, { borderBottomColor: colors.line }]}>
          <Text style={[styles.brand, { color: colors.ink }]}>Navo</Text>
          <Feather name="map-pin" size={27} color={stageColor} accessible={false} />
          <NavoPressable motion="compact" accessibilityRole="button" accessibilityLabel="Close alert"
            accessibilityHint="Closes this view. Later alerts remain on." disabled={busy !== null} onPress={close} style={styles.close}>
            <Feather name="x" size={23} color={colors.muted} />
          </NavoPressable>
        </View>

        {!app.ready ? <View style={styles.recovery}>
          {app.storageProblem ? null : <ActivityIndicator size="large" color={colors.accent} />}
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>{app.storageProblem ? 'Saved data unavailable' : 'Loading your alert'}</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{app.storageProblem ?? 'Reading the saved destination from this device.'}</Text>
          {app.storageProblem ? <NavoPressable accessibilityRole="button" onPress={() => void retry()} style={[styles.secondary, { borderColor: colors.line }]}><Text style={[styles.buttonText, { color: colors.ink }]}>Retry saved data</Text></NavoPressable> : null}
        </View> : !current ? <View style={styles.recovery}>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>This alert has ended</Text>
          <Text style={[styles.body, { color: colors.muted }]}>It may have been handled, expired, or belong to an earlier trip. Your saved destination is unchanged.</Text>
          {shownProblem ? <Text accessibilityRole="alert" style={[styles.problem, { color: colors.danger }]}>{shownProblem}</Text> : null}
          {cleanupProblem ? <NavoPressable accessibilityRole="button" disabled={busy !== null} onPress={() => void retrySilencing()} style={[styles.secondary, { borderColor: colors.line }]}><Text style={[styles.buttonText, { color: colors.ink }]}>{busy === 'mute' ? 'Silencing…' : 'Retry silencing'}</Text></NavoPressable> : null}
          {others.length ? <NavoPressable accessibilityRole="button" onPress={nextAlert} style={[styles.primary, { backgroundColor: colors.accent }]}><Text style={[styles.buttonText, { color: colors.onAccent }]}>View next alert</Text></NavoPressable> : null}
          <NavoPressable accessibilityRole="button" onPress={() => router.replace('/(tabs)')} style={[styles.secondary, { borderColor: colors.line }]}><Text style={[styles.buttonText, { color: colors.ink }]}>Return to alarms</Text></NavoPressable>
        </View> : <>
          <View style={styles.message}>
            <Text ref={heading} accessible accessibilityRole="header" accessibilityLabel={`${title.replace(/\n/g, ' ')} ${current.destination.name}`}
              style={[styles.heading, { color: stage === 'missed' ? colors.warning : colors.ink }]}>{title}</Text>
            <Text style={[styles.destination, { color: colors.ink }]}>{current.destination.name}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>{context}</Text>
            <Text style={[styles.distance, { color: stageColor }]}>{distanceLabel}</Text>
            <Text style={[styles.estimate, { color: colors.muted }]}>{stage === 'missed' ? 'Moving away from the saved point' : 'Straight-line GPS estimate'} · Alert at {alertTime}</Text>
            {locationProblem ? <Text style={[styles.freshness, { color: colors.warning }]}>{locationProblem}</Text> : null}
            <Text style={[styles.guidance, { color: colors.ink }]}>{guidance}</Text>
          </View>
          <View style={styles.actions}>
            {shownProblem ? <>
              <Text accessibilityRole="alert" style={[styles.problem, { color: colors.danger }]}>{shownProblem}</Text>
              <NavoPressable accessibilityRole="button" disabled={busy !== null} onPress={() => void retry()} style={[styles.secondary, { borderColor: colors.line }]}><Text style={[styles.buttonText, { color: colors.ink }]}>Retry saved data</Text></NavoPressable>
            </> : null}
            {others.length ? <View style={[styles.otherAlerts, { borderBottomColor: colors.line }]}>
              <Text accessibilityLiveRegion="polite" style={[styles.otherCount, { color: colors.muted }]}>{others.length} other {others.length === 1 ? 'alert' : 'alerts'}</Text>
              <NavoPressable motion="compact" accessibilityRole="button" disabled={busy !== null} onPress={nextAlert} style={styles.next}>
                <Text style={[styles.nextText, { color: colors.accent }]}>Next alert</Text><Feather name="arrow-right" size={18} color={colors.accent} />
              </NavoPressable>
            </View> : null}
            <NavoPressable accessibilityRole="button" accessibilityState={{ disabled: busy !== null, busy: busy === 'primary' }} disabled={busy !== null}
              onPress={() => void act(stage === 'arrived' ? 'complete' : 'acknowledge', 'primary')}
              style={[styles.primary, { backgroundColor: busy !== null ? colors.line : colors.accent }]}>
              <Text style={[styles.buttonText, { color: busy !== null ? colors.quiet : colors.onAccent }]}>{busy === 'primary' ? 'Saving…' : primaryTitle}</Text>
            </NavoPressable>
            <Text style={[styles.helper, { color: colors.muted }]}>{helper}</Text>
            <NavoPressable accessibilityRole="button" accessibilityState={{ disabled: busy !== null, busy: busy === 'mute' }} disabled={busy !== null}
              onPress={() => void act('acknowledge', 'mute')} style={[styles.secondary, { borderColor: colors.line }]}>
              <Text style={[styles.buttonText, { color: colors.ink }]}>{busy === 'mute' ? 'Saving…' : 'Mute this alert'}</Text>
            </NavoPressable>
            <NavoPressable motion="compact" accessibilityRole="button" disabled={busy !== null} onPress={confirmEnd} style={styles.end}>
              <Text style={[styles.endText, { color: colors.muted }]}>{busy === 'end' ? 'Ending this alarm…' : 'End tracking…'}</Text>
            </NavoPressable>
          </View>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  brand: { flex: 1, fontSize: 20, lineHeight: 27, fontWeight: '700' },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
  message: { paddingTop: 28 },
  heading: { fontSize: 32, lineHeight: 40, fontWeight: '700', letterSpacing: -0.5 },
  destination: { fontSize: 26, lineHeight: 34, fontWeight: '600', marginTop: 34 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 12 },
  distance: { fontSize: 21, lineHeight: 29, fontWeight: '600', marginTop: 30 },
  estimate: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  freshness: { fontSize: 14, lineHeight: 21, marginTop: 12 },
  guidance: { fontSize: 16, lineHeight: 24, marginTop: 30 },
  actions: { marginTop: 'auto', paddingTop: 40, gap: 12 },
  primary: { minHeight: 56, borderRadius: 14, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  secondary: { minHeight: 54, borderRadius: 14, borderWidth: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  buttonText: { fontSize: 16, lineHeight: 23, fontWeight: '700', textAlign: 'center' },
  helper: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 4 },
  end: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  endText: { fontSize: 14, lineHeight: 21, fontWeight: '500', textAlign: 'center' },
  recovery: { flex: 1, gap: 20, paddingTop: 44, paddingBottom: 24 },
  body: { fontSize: 16, lineHeight: 24 },
  problem: { fontSize: 14, lineHeight: 21 },
  otherAlerts: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 4, paddingBottom: 8 },
  otherCount: { flex: 1, fontSize: 14, lineHeight: 21 },
  next: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8 },
  nextText: { fontSize: 14, lineHeight: 21, fontWeight: '700' },
});
