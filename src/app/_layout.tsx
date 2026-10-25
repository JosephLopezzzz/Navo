import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppStateProvider } from '../state/AppStateProvider';
import { useNavoColors } from '../theme/colors';
import '../services/background-location';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const colors = useNavoColors();
  return (
    <AppStateProvider>
      <StatusBar style="auto" />
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
    </AppStateProvider>
  );
}
