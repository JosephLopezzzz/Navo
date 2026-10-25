import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Appearance } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AppStateProvider, useAppState } from '../state/AppStateProvider';
import { useNavoColors } from '../theme/colors';
import '../services/background-location';
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
    Appearance.setColorScheme(colors.isDark ? 'dark' : 'light');
  }, [app.ready, app.storageProblem, colors.isDark]);
  useEffect(() => {
    if (app.ready || app.storageProblem) void SplashScreen.hideAsync();
  }, [app.ready, app.storageProblem]);

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
        <Stack.Screen name="trip/setup" options={{ title: 'Choose your stops' }} />
        <Stack.Screen name="trip/active" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="bus/new" options={{ title: 'Create a bus route' }} />
      </Stack>
    </>
  );
}
