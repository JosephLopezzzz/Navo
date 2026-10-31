import { useCallback, useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Appearance, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AppStateProvider, useAppState } from '../state/AppStateProvider';
import { useNavoColors } from '../theme/colors';
import { OfflineManager } from '@maplibre/maplibre-react-native';
import { deliverPendingDestinationAlarmEvents } from '../services/background-location';
import * as Notifications from 'expo-notifications';
import { LEGAL_DOCUMENT_VERSION } from '../data/legal';
import { GuideTargetsProvider } from '../components/guide/GuideTargets';
import { InAppGuide } from '../components/guide/InAppGuide';

const MAX_AMBIENT_MAP_CACHE_BYTES = 32 * 1024 * 1024;

void SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  return (
    <AppStateProvider>
      <RootNavigator />
    </AppStateProvider>
  );
}

function RootNavigator() {
  const app = useAppState();
  const colors = useNavoColors();
  const isLoadingAppearance = !app.ready && !app.storageProblem;
  const legalAcknowledged = app.firstRun.legalAcknowledgement?.version === LEGAL_DOCUMENT_VERSION
    && Boolean(app.firstRun.legalAcknowledgement.acknowledgedAt);
  const showFirstRunStatus = !app.ready || Boolean(app.storageProblem);
  const showLegalGate = app.ready && !legalAcknowledged;
  const showProfileSetup = app.ready && legalAcknowledged && !app.firstRun.onboardingComplete;
  const showApp = app.ready && legalAcknowledged && app.firstRun.onboardingComplete;
  const statusRedirectTo = showLegalGate ? '/first-run/legal' : showProfileSetup ? '/first-run/profile' : '/(tabs)';
  const legalRedirectTo = showFirstRunStatus ? '/first-run/status' : showProfileSetup ? '/first-run/profile' : '/(tabs)';
  const profileRedirectTo = showFirstRunStatus ? '/first-run/status' : showLegalGate ? '/first-run/legal' : '/(tabs)';
  const appRedirectTo = showFirstRunStatus ? '/first-run/status' : showLegalGate ? '/first-run/legal' : '/first-run/profile';
  const mutateState = app.mutateState;
  const finishGuide = useCallback(() => {
    void mutateState((current) => ({
      ...current,
      firstRun: { ...current.firstRun, guideCompleted: true },
    })).catch(() => undefined);
  }, [mutateState]);
  useEffect(() => {
    if (!app.ready && !app.storageProblem) return;
    Appearance.setColorScheme(app.settings.appearance === 'system' ? 'auto' : app.settings.appearance);
  }, [app.ready, app.storageProblem, app.settings.appearance]);
  useEffect(() => {
    if (app.ready || app.storageProblem) void SplashScreen.hideAsync();
  }, [app.ready, app.storageProblem]);
  useEffect(() => {
    if (app.ready) void deliverPendingDestinationAlarmEvents();
  }, [app.ready]);
  useEffect(() => {
    if (!app.ready) return;
    const timer = setTimeout(() => {
      void OfflineManager.setMaximumAmbientCacheSize(MAX_AMBIENT_MAP_CACHE_BYTES).catch(() => undefined);
    }, 5_000);
    return () => clearTimeout(timer);
  }, [app.ready]);

  return (
    <GuideTargetsProvider onGuideFinish={finishGuide}>
      <View style={{ flex: 1 }}>
        <StatusBar style={isLoadingAppearance || colors.isDark ? 'light' : 'dark'} animated />
        <Stack screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.ink,
          headerTitleStyle: { color: colors.ink, fontWeight: '600' },
          headerShadowVisible: false,
        }}>
          <Stack.Protected guard={showFirstRunStatus} redirectTo={statusRedirectTo}>
            <Stack.Screen name="first-run/status" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={showLegalGate} redirectTo={legalRedirectTo}>
            <Stack.Screen name="first-run/legal" options={{ headerShown: false, gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={showProfileSetup} redirectTo={profileRedirectTo}>
            <Stack.Screen name="first-run/profile" options={{ headerShown: false, gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={showApp} redirectTo={appRedirectTo}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="destination/pick" options={{ title: 'Choose a destination', headerShown: false }} />
            <Stack.Screen name="destination/map" options={{ title: 'Pick on map', headerShown: false }} />
            <Stack.Screen name="alarm/enable" options={{ title: 'Enable alarm', headerShown: false }} />
            <Stack.Screen name="permissions" options={{ title: 'Alarm permissions', headerShown: false }} />
            <Stack.Screen name="legal/[page]" options={{ title: 'Navo information', headerShown: false }} />
            <Stack.Screen name="preferences" options={{ title: 'Recommendation preferences', headerShown: false }} />
            <Stack.Screen name="trip/setup" options={{ title: 'Choose your stops' }} />
            <Stack.Screen name="trip/active" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="bus/new" options={{ title: 'Create a bus route' }} />
          </Stack.Protected>
        </Stack>
        <InAppGuide />
      </View>
    </GuideTargetsProvider>
  );
}
