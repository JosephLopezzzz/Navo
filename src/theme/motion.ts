/** Shared, restrained touch feedback. Distances use React Native layout units. */
export const pressMotion = {
  button: { scale: 0.98, translateY: 1 },
  card: { scale: 0.99, translateY: 1 },
  compact: { scale: 0.97, translateY: 0.5 },
  none: { scale: 1, translateY: 0 },
} as const;

export type PressMotion = keyof typeof pressMotion;

export const pressTiming = { duration: 90 } as const;
export const releaseSpring = {
  stiffness: 420,
  damping: 22,
  mass: 0.7,
  restDisplacementThreshold: 0.005,
  restSpeedThreshold: 0.03,
} as const;
