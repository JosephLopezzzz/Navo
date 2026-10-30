import { router } from 'expo-router';
import { UserPreferencesForm } from '../components/onboarding/UserPreferencesForm';

export default function PreferencesScreen() {
  return <UserPreferencesForm title="Your preferences" onDone={() => router.back()} isFirstRun={false} />;
}
