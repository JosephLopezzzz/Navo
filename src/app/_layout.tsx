import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Appearance, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AppStateProvider, useAppState } from '../state/AppStateProvider';
import { useNavoColors } from '../theme/colors';
import { deliverPendingDestinationAlarmEvents } from '../services/background-location';
import * as Notifications from 'expo-notifications';
import { LEGAL_DOCUMENT_VERSION } from '../data/legal';
import { GuideTargetsProvider } from '../components/guide/GuideTargets';
import { InAppGuide } from '../components/guide/InAppGuide';

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
  const showGuide = showApp && !app.firstRun.guideCompleted;
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

  return (
    <GuideTargetsProvider>
      <View style={{ flex: 1 }}>
        <StatusBar style={isLoadingAppearance || colors.isDark ? 'light' : 'dark'} animated />
        <Stack screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.ink,
          headerTitleStyle: { color: colors.ink, fontWeight: '600' },
          headerShadowVisible: false,
        }}>
          <Stack.Protected guard={showFirstRunStatus}>
            <Stack.Screen name="first-run/status" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={showLegalGate} redirectTo="/first-run/legal">
            <Stack.Screen name="first-run/legal" options={{ headerShown: false, gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={showProfileSetup} redirectTo="/first-run/profile">
            <Stack.Screen name="first-run/profile" options={{ headerShown: false, gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={showApp} redirectTo="/(tabs)">
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="destination/pick" options={{ title: 'Choose a destination', headerShown: false }} />
            <Stack.Screen name="destination/map" options={{ title: 'Pick on map', headerShown: false }} />
            <Stack.Screen name="legal/[page]" options={{ title: 'Navo information', headerShown: false }} />
            <Stack.Screen name="preferences" options={{ title: 'Recommendation preferences', headerShown: false }} />
            <Stack.Screen name="trip/setup" options={{ title: 'Choose your stops' }} />
            <Stack.Screen name="trip/active" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="bus/new" options={{ title: 'Create a bus route' }} />
          </Stack.Protected>
        </Stack>
        {showGuide ? <InAppGuide onFinish={() => {
          void app.updateState({ firstRun: { ...app.firstRun, guideCompleted: true } }).catch(() => undefined);
        }} /> : null}
      </View>
    </GuideTargetsProvider>
  );
}
