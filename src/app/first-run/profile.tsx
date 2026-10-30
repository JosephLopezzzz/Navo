import { router } from 'expo-router';
import { UserPreferencesForm } from '../../components/onboarding/UserPreferencesForm';

export default function FirstRunProfileScreen() {
  return <UserPreferencesForm onDone={() => router.replace('/(tabs)')} />;
}
