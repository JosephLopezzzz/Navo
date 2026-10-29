import { Screen, ScreenTitle, PrimaryButton, Subtle } from '../../components/ui';
import { useAppState } from '../../state/AppStateProvider';

export default function FirstRunStatusScreen() {
  const app = useAppState();
  return (
    <Screen>
      <ScreenTitle>{app.storageProblem ? 'Saved data unavailable' : 'Loading Navo'}</ScreenTitle>
      <Subtle>{app.storageProblem ?? 'Reading your saved destinations and preferences from this device.'}</Subtle>
      {app.storageProblem ? <PrimaryButton title="Retry saved data" onPress={() => void app.refreshState()} /> : null}
    </Screen>
  );
}
