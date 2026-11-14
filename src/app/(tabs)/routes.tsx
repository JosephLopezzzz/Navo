import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { NavoPressable as Pressable } from '../../components/NavoPressable';
import { Divider, Screen, ScreenTitle, Subtle } from '../../components/ui';
import { railLines } from '../../data/routes';
import { deleteBusRoute, duplicateBusRoute, isBusRouteInUse, upsertBusRoute } from '../../domain/bus-routes';
import type { TransitRoute } from '../../domain/models';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';
import { useScreenActionScope } from '../../hooks/useScreenActionScope';

export default function RoutesScreen() {
  const colors = useNavoColors();
  const app = useAppState();
  const captureAction = useScreenActionScope();
  const { customBusRoutes } = app;
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'dialog' | 'copy' | 'delete' | null>(null);
  const [actionProblem, setActionProblem] = useState<string | null>(null);
  const operation = useRef<'dialog' | 'write' | null>(null);
  const copyRetry = useRef<{ source: string; reverse: boolean; route: TransitRoute } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current = null; };
  }, []);
  const busy = pendingAction !== null;
  const trip = app.activeTrip;
  const activeRoute = app.activeRoute;
  const resumableTrip = trip && activeRoute && (trip.status === 'active' || trip.status === 'completed');
  const tripAction = trip?.status === 'completed' ? 'Finish trip' : 'Continue trip';
  const tripDestination = trip && activeRoute ? activeRoute.stops[trip.destinationIndex]?.name : undefined;
  const navigate = (path: '/bus/new' | '/trip/active') => {
    if (!operation.current) router.push(path);
  };
  const createBusRoute = () => navigate('/bus/new');
  const openRoute = (routeId: string, edit = false) => {
    if (operation.current) return;
    copyRetry.current = null;
    router.push({ pathname: edit ? '/bus/new' : '/trip/setup', params: { routeId } });
  };

  const copyRoute = async (source: TransitRoute, reverse = false) => {
    const isCurrent = captureAction();
    if (operation.current || !app.ready || !isCurrent()) return;
    operation.current = 'write';
    setPendingAction('copy');
    setActionProblem(null);
    try {
      const sourceSnapshot = JSON.stringify(source);
      const previous = copyRetry.current;
      const route = previous?.source === sourceSnapshot && previous.reverse === reverse ? previous.route
        : duplicateBusRoute(source, `bus-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, reverse);
      copyRetry.current = { source: sourceSnapshot, reverse, route };
      await app.mutateState((current) => {
        const savedCopy = current.customBusRoutes.find((item) => item.id === route.id);
        if (savedCopy && JSON.stringify(savedCopy) === JSON.stringify(route)) return current;
        const currentSource = current.customBusRoutes.find((item) => item.id === source.id);
        if (!currentSource || JSON.stringify(currentSource) !== sourceSnapshot) {
          throw new Error('This route changed or was removed. Review it before creating a copy.');
        }
        return upsertBusRoute(current, route, null);
      });
      copyRetry.current = null;
      if (isCurrent()) router.push({ pathname: '/bus/new', params: { routeId: route.id } });
    } catch (error) {
      await app.refreshState();
      if (mounted.current) setActionProblem(error instanceof Error && /^(This route changed|A different route)/.test(error.message) ? error.message : 'Navo could not confirm the route copy. Review your saved routes and try again.');
    } finally {
      operation.current = null;
      if (mounted.current) setPendingAction(null);
    }
  };

  const requestDelete = (route: TransitRoute) => {
    const isCurrent = captureAction();
    if (operation.current || !app.ready || !isCurrent()) return;
    if (isBusRouteInUse(app, route.id)) {
      setActionProblem('Finish or end the trip using this route before deleting it.');
      return;
    }
    operation.current = 'dialog';
    setPendingAction('dialog');
    setActionProblem(null);
    const cancel = () => {
      if (operation.current !== 'dialog') return;
      operation.current = null;
      if (mounted.current) setPendingAction(null);
    };
    const remove = async () => {
      if (!isCurrent()) { cancel(); return; }
      if (operation.current !== 'dialog' || !mounted.current) return;
      operation.current = 'write';
      setPendingAction('delete');
      try {
        await app.mutateState((current) => deleteBusRoute(current, route.id, route));
        if (mounted.current) setExpandedRouteId(null);
      } catch (error) {
        await app.refreshState();
        if (mounted.current) setActionProblem(error instanceof Error && /^(This route changed|Finish or end)/.test(error.message) ? error.message : 'Navo could not confirm that the route was deleted. Review your saved routes and try again.');
      } finally {
        operation.current = null;
        if (mounted.current) setPendingAction(null);
      }
    };
    Alert.alert(`Delete “${route.name}”?`, 'This removes the saved route from this device.', [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: 'Delete route', style: 'destructive', onPress: () => { void remove(); } },
    ], { cancelable: true, onDismiss: cancel });
  };

  return (
    <Screen tabBar>
      {app.firstRun.preferences.displayName ? <Text style={[styles.greeting, { color: colors.muted }]}>Hi, {app.firstRun.preferences.displayName.trim().split(/\s+/)[0]}</Text> : null}

      <View style={styles.intro}>
        <ScreenTitle>Routes</ScreenTitle>
        <Subtle>Follow rail stops or build your own bus route.</Subtle>
      </View>

      {resumableTrip ? (
        <Pressable motion="card" accessibilityRole="button" accessibilityLabel={`${tripAction}, ${activeRoute.name}, destination ${tripDestination ?? 'your stop'}`} disabled={busy} onPress={() => navigate('/trip/active')} style={[styles.resumeTrip, { backgroundColor: colors.accentSoft }]}>
          <Feather name={trip.status === 'completed' ? 'check-circle' : 'play-circle'} size={23} color={colors.accent} />
          <View style={styles.lineCopy}>
            <Text style={[styles.lineName, { color: colors.ink }]}>{tripAction}</Text>
            <Text style={[styles.direction, { color: colors.muted }]}>{activeRoute.name} · {tripDestination ?? 'Your stop'}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.accent} />
        </Pressable>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>Rail lines</Text>
          <Text style={[styles.sectionDetail, { color: colors.muted }]}>Choose a line</Text>
        </View>
        <View style={[styles.lineList, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          {railLines.map((line, index) => (
            <View key={line.id}>
              <Pressable motion="card" accessibilityRole="button" accessibilityLabel={`${line.name}, ${line.stops.length} stops. Choose boarding and destination for manual progress.`} disabled={busy} onPress={() => { if (!operation.current) router.push({ pathname: '/trip/setup', params: { lineId: line.id } }); }} style={styles.lineRow}>
                <View style={[styles.lineIcon, { backgroundColor: colors.accentSoft }]}><Feather name="navigation" size={18} color={colors.accent} /></View>
                <View style={styles.lineCopy}>
                  <View style={styles.lineNameRow}>
                    <Text style={[styles.lineName, styles.flexibleName, { color: colors.ink }]}>{line.name}</Text>
                    <Text style={[styles.count, { color: colors.muted }]}>{line.stops.length} stops</Text>
                  </View>
                  <Text style={[styles.direction, { color: colors.muted }]}>{line.direction}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.quiet} />
              </Pressable>
              {index < railLines.length - 1 ? <Divider /> : null}
            </View>
          ))}
        </View>
        <View style={styles.manualHelp}>
          <Subtle style={styles.hint}>Rail trips use manual stop progress. For an arrival reminder, save a station alarm.</Subtle>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { if (!operation.current) router.push({ pathname: '/destination/pick', params: { kind: 'rail-station' } }); }} style={styles.alarmLink}>
            <Feather name="bell" size={17} color={colors.accent} />
            <Text style={[styles.actionText, { color: colors.accent }]}>Add a station alarm</Text>
            <Feather name="arrow-right" size={17} color={colors.accent} />
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>Your bus routes</Text>
          {app.ready && !app.storageProblem && customBusRoutes.length > 0 ? (
            <Pressable motion="compact" accessibilityRole="button" accessibilityLabel="Create a bus route" disabled={busy} onPress={createBusRoute} style={[styles.addButton, { backgroundColor: colors.accentSoft }]}>
              <Feather name="plus" size={17} color={colors.accent} />
              <Text style={[styles.actionText, { color: colors.accent }]}>Add</Text>
            </Pressable>
          ) : null}
        </View>
        {app.storageProblem ? (
          <View style={styles.manualHelp}>
            <Text accessibilityRole="alert" style={[styles.hint, { color: colors.danger }]}>{app.ready ? 'Saved route changes could not be confirmed. Refresh your saved routes.' : 'Saved bus routes could not load. Try again to view your routes.'}</Text>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { if (!operation.current) void app.refreshState(); }} style={styles.alarmLink}>
              <Feather name="refresh-cw" size={17} color={colors.accent} />
              <Text style={[styles.actionText, { color: colors.accent }]}>Retry saved routes</Text>
            </Pressable>
          </View>
        ) : null}
        {actionProblem ? <Text accessibilityRole="alert" style={[styles.hint, { color: colors.danger }]}>{actionProblem}</Text> : null}
        {pendingAction === 'copy' || pendingAction === 'delete' ? <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.muted }]}>{pendingAction === 'copy' ? 'Saving route copy…' : 'Deleting route…'}</Text> : null}
        {!app.ready ? !app.storageProblem ? <Subtle>Loading saved bus routes…</Subtle> : null : customBusRoutes.length === 0 ? (
          <Pressable motion="card" accessibilityRole="button" disabled={busy} onPress={createBusRoute} style={[styles.emptyBus, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={[styles.lineIcon, { backgroundColor: colors.accentSoft }]}><Feather name="plus" size={20} color={colors.accent} /></View>
            <View style={styles.lineCopy}>
              <Text style={[styles.lineName, { color: colors.ink }]}>Create your first bus route</Text>
              <Text style={[styles.direction, { color: colors.muted }]}>Add your stops in travel order. Follow them offline.</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.quiet} />
          </Pressable>
        ) : customBusRoutes.map((route) => {
          const expanded = expandedRouteId === route.id;
          const inUse = isBusRouteInUse(app, route.id);
          return (
            <View key={route.id} style={[styles.savedRoute, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.savedRouteHeading}>
                <Pressable motion="card" accessibilityRole="button" accessibilityLabel={`Choose stops on ${route.name}, ${route.stops.length} stops`} disabled={busy} onPress={() => openRoute(route.id)} style={styles.savedRouteOpen}>
                  <View style={styles.lineCopy}>
                    <View style={styles.lineNameRow}>
                      <Text style={[styles.lineName, styles.flexibleName, { color: colors.ink }]}>{route.name}</Text>
                      <Text style={[styles.count, { color: colors.muted }]}>{route.stops.length} stops</Text>
                    </View>
                    <Text style={[styles.direction, { color: colors.muted }]}>{route.direction}</Text>
                    <Text style={[styles.routeMode, { color: colors.muted }]}>{route.coordinateStatus === 'complete' ? 'Saved stop locations · GPS and manual progress' : 'Manual stop progress'}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.quiet} />
                </Pressable>
                <Pressable motion="compact" accessibilityRole="button" accessibilityLabel={`Actions for ${route.name}`} accessibilityState={{ expanded, disabled: busy }} disabled={busy} onPress={() => {
                  if (operation.current) return;
                  setExpandedRouteId(expanded ? null : route.id);
                  setActionProblem(null);
                }} style={styles.moreButton}>
                  <Feather name={expanded ? 'x' : 'more-horizontal'} size={20} color={colors.accent} />
                </Pressable>
              </View>
              {expanded ? <View style={[styles.routeActions, { borderTopColor: colors.line }]}>
                <Pressable motion="card" accessibilityRole="button" disabled={busy} onPress={() => openRoute(route.id, true)} style={styles.routeAction}>
                  <Feather name="edit-2" size={17} color={colors.accent} /><Text style={[styles.actionText, { color: colors.ink }]}>Edit route</Text>
                </Pressable>
                <Pressable motion="card" accessibilityRole="button" disabled={busy} onPress={() => void copyRoute(route)} style={styles.routeAction}>
                  <Feather name="copy" size={17} color={colors.accent} /><Text style={[styles.actionText, { color: colors.ink }]}>Duplicate route</Text>
                </Pressable>
                <Pressable motion="card" accessibilityRole="button" disabled={busy} onPress={() => void copyRoute(route, true)} style={styles.routeAction}>
                  <Feather name="repeat" size={17} color={colors.accent} /><Text style={[styles.actionText, { color: colors.ink }]}>Create reversed copy</Text>
                </Pressable>
                {inUse ? <Subtle style={styles.inUseNote}>Finish or end the current trip before deleting this route.</Subtle> : null}
                <Pressable motion="card" accessibilityRole="button" accessibilityState={{ disabled: busy || inUse }} disabled={busy || inUse} onPress={() => requestDelete(route)} style={[styles.routeAction, { opacity: busy || inUse ? 0.45 : 1 }]}>
                  <Feather name="trash-2" size={17} color={colors.danger} /><Text style={[styles.actionText, { color: colors.danger }]}>Delete route</Text>
                </Pressable>
              </View> : null}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 12, fontWeight: '600' },
  intro: { gap: 6 },
  section: { gap: 12 },
  sectionHeading: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { flexShrink: 1, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  sectionDetail: { flexShrink: 1, fontSize: 12, lineHeight: 17, textAlign: 'right' },
  lineList: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  lineRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 14 },
  lineIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  lineCopy: { flex: 1, gap: 4 },
  lineNameRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  lineName: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  flexibleName: { flex: 1 },
  count: { flexShrink: 0, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  direction: { fontSize: 13, lineHeight: 19 },
  hint: { fontSize: 13, lineHeight: 19 },
  manualHelp: { gap: 2 },
  alarmLink: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8, paddingHorizontal: 2, borderRadius: 10 },
  actionText: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  resumeTrip: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  addButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12 },
  emptyBus: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 14 },
  savedRoute: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  savedRouteHeading: { flexDirection: 'row', alignItems: 'center' },
  savedRouteOpen: { flex: 1, minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  moreButton: { width: 44, height: 44, marginRight: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  routeActions: { borderTopWidth: StyleSheet.hairlineWidth },
  routeAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  inUseNote: { paddingHorizontal: 12, paddingTop: 8, fontSize: 12, lineHeight: 17 },
  routeMode: { fontSize: 12, lineHeight: 17 },
});
