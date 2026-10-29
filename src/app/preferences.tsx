import { router } from 'expo-router';
import { Screen } from '../components/ui';
import { UserPreferencesForm } from '../components/onboarding/UserPreferencesForm';

export default function PreferencesScreen() {
  return (
    <Screen>
      <UserPreferencesForm title="Recommendation preferences" onDone={() => router.back()} />
    </Screen>
  );
}
