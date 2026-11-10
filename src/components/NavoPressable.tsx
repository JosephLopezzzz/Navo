import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useNavoColors } from '../theme/colors';
import { pressMotion, pressTiming, releaseSpring, type PressMotion } from '../theme/motion';
import { useMotionPreferences } from './MotionPreferencesProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type NavoPressableProps = ComponentProps<typeof Pressable> & { motion?: PressMotion };

/** Shared touch feedback for Navo buttons, chips, and tappable cards. */
export function NavoPressable({ android_ripple, children, disabled, motion = 'button', onBlur, onPressIn, onPressOut, onTouchCancel, style, testOnly_pressed, ...props }: NavoPressableProps) {
  const colors = useNavoColors();
  const { reduceMotion, isActive, pathname } = useMotionPreferences();
  const scope = `${Boolean(disabled)}:${isActive}:${pathname}`;
  const [pressState, setPressState] = useState({ scope, pressed: false });
  // Reset derived press state before rendering a new route/lifecycle scope.
  if (pressState.scope !== scope) setPressState({ scope, pressed: false });
  const pressActive = useRef(false);
  const [progress] = useState(() => new Animated.Value(0));
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const preset = pressMotion[motion];
  const motionEnabled = !reduceMotion && !disabled && isActive && motion !== 'none';
  const isPressed = Boolean(((pressState.scope === scope && pressState.pressed) || testOnly_pressed) && !disabled && isActive);
  const state = { pressed: isPressed };
  const contentStyle = typeof style === 'function' ? style(state) : style;
  const existingTransform = StyleSheet.flatten(contentStyle)?.transform;
  const animatedTransform = useMemo(() => [
    { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, preset.scale] }) },
    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, preset.translateY] }) },
  ], [preset, progress]);

  const resetMovement = useCallback(() => {
    animation.current?.stop();
    progress.setValue(0);
    pressActive.current = false;
  }, [progress]);

  const reset = () => {
    resetMovement();
    setPressState({ scope, pressed: false });
  };

  useEffect(resetMovement, [disabled, isActive, pathname, resetMovement]);
  useEffect(() => {
    if (!motionEnabled) {
      animation.current?.stop();
      progress.setValue(0);
    }
  }, [motionEnabled, progress]);
  useEffect(() => () => {
    animation.current?.stop();
    progress.stopAnimation();
  }, [progress]);

  return (
    <AnimatedPressable
      {...props}
      android_ripple={android_ripple ?? (motion === 'none' ? undefined : { color: colors.pressHighlight, foreground: true })}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled && isActive) {
          pressActive.current = true;
          setPressState({ scope, pressed: true });
          if (motionEnabled) {
            animation.current?.stop();
            animation.current = Animated.timing(progress, { ...pressTiming, toValue: 1, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false });
            animation.current.start();
          }
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        const wasPressed = pressActive.current;
        pressActive.current = false;
        setPressState({ scope, pressed: false });
        if (wasPressed && motionEnabled) {
          animation.current?.stop();
          animation.current = Animated.spring(progress, { ...releaseSpring, toValue: 0, useNativeDriver: true, isInteraction: false });
          animation.current.start();
        }
        onPressOut?.(event);
      }}
      onBlur={(event) => { reset(); onBlur?.(event); }}
      onTouchCancel={(event) => { reset(); onTouchCancel?.(event); }}
      style={[
        contentStyle,
        styles.rippleClip,
        // Array transforms compose with touch motion; keep caller string transforms intact.
        motionEnabled && typeof existingTransform !== 'string' && { transform: [...(existingTransform ?? []), ...animatedTransform] },
      ]}
    >
      {typeof children === 'function' ? children(state) : children}
      {isPressed && motion !== 'none' ? <View accessible={false} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.pressHighlight }]} /> : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  rippleClip: { overflow: 'hidden' },
});
