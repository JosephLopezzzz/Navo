import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { usePathname } from 'expo-router';

interface MotionPreferences {
  reduceMotion: boolean;
  isActive: boolean;
  pathname: string;
}

// Keep feedback stationary until the device preference is known, or outside the app provider.
const MotionPreferencesContext = createContext<MotionPreferences>({ reduceMotion: true, isActive: true, pathname: '' });

/** One set of native preference/lifecycle subscriptions for all custom controls. */
export function MotionPreferencesProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [reduceMotion, setReduceMotion] = useState(true);
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    let mounted = true;
    let preferenceRevision = 0;
    const refreshPreference = () => {
      const revision = ++preferenceRevision;
      void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
        if (mounted && revision === preferenceRevision) setReduceMotion(enabled);
      }).catch(() => {
        if (mounted && revision === preferenceRevision) setReduceMotion(true);
      });
    };

    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      preferenceRevision += 1;
      setReduceMotion(enabled);
    });
    const stateSubscription = AppState.addEventListener('change', (state) => {
      setIsActive(state === 'active');
      if (state === 'active') refreshPreference();
    });
    // Android can lose interaction focus to the notification shade while still active.
    const blurSubscription = AppState.addEventListener('blur', () => setIsActive(false));
    const focusSubscription = AppState.addEventListener('focus', () => {
      setIsActive(AppState.currentState === 'active');
      refreshPreference();
    });
    refreshPreference();

    return () => {
      mounted = false;
      motionSubscription.remove();
      stateSubscription.remove();
      blurSubscription.remove();
      focusSubscription.remove();
    };
  }, []);

  const value = useMemo(() => ({ reduceMotion, isActive, pathname }), [reduceMotion, isActive, pathname]);
  return <MotionPreferencesContext value={value}>{children}</MotionPreferencesContext>;
}

export function useMotionPreferences(): MotionPreferences {
  return useContext(MotionPreferencesContext);
}
