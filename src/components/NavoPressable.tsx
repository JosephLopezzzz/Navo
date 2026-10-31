import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { useNavoColors } from '../theme/colors';

/** Shared touch feedback for Navo buttons, chips, and tappable cards. */
export function NavoPressable({ android_ripple, children, disabled, style, ...props }: PressableProps) {
  const colors = useNavoColors();

  return (
    <Pressable
      {...props}
      android_ripple={android_ripple ?? { color: colors.pressHighlight, foreground: true }}
      disabled={disabled}
      style={(state) => {
        const contentStyle = typeof style === 'function' ? style(state) : style;

        return [contentStyle, styles.rippleClip];
      }}
    >
      {({ pressed }) => (
        <>
          {typeof children === 'function' ? children({ pressed }) : children}
          {pressed && !disabled ? <View accessible={false} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.pressHighlight }]} /> : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rippleClip: { overflow: 'hidden' },
});
