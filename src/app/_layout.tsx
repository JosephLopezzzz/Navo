import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Appearance } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AppStateProvider, useAppState } from '../state/AppStateProvider';
import { useNavoColors } from '../theme/colors';
import { deliverPendingDestinationAlarmEvents } from '../services/background-location';
import * as Notifications from 'expo-notifications';

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
    <>
      <StatusBar style={isLoadingAppearance || colors.isDark ? 'light' : 'dark'} animated />
      <Stack screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.ink,
        headerTitleStyle: { color: colors.ink, fontWeight: '600' },
        headerShadowVisible: false,
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="destination/pick" options={{ title: 'Choose a destination', headerShown: false }} />
        <Stack.Screen name="destination/map" options={{ title: 'Pick on map', headerShown: false }} />
        <Stack.Screen name="legal/[page]" options={{ title: 'Navo information', headerShown: false }} />
        <Stack.Screen name="trip/setup" options={{ title: 'Choose your stops' }} />
        <Stack.Screen name="trip/active" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="bus/new" options={{ title: 'Create a bus route' }} />
      </Stack>
    </>
  );
}
