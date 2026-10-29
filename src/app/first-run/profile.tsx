import { router } from 'expo-router';
import { Screen } from '../../components/ui';
import { UserPreferencesForm } from '../../components/onboarding/UserPreferencesForm';

export default function FirstRunProfileScreen() {
  return (
    <Screen>
      <UserPreferencesForm onDone={() => router.replace('/(tabs)')} />
    </Screen>
  );
}
