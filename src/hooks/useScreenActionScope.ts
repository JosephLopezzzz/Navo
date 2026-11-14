import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/** A completion belongs to the visit in which the rider started its action. */
export function createScreenActionScope() {
  let activeVisit: object | null = null;
  return {
    enter() {
      const visit = {};
      activeVisit = visit;
      return () => { if (activeVisit === visit) activeVisit = null; };
    },
    capture() {
      const visit = activeVisit;
      return () => visit !== null && activeVisit === visit;
    },
  };
}

export function useScreenActionScope() {
  const [scope] = useState(createScreenActionScope);
  useFocusEffect(useCallback(() => scope.enter(), [scope]));
  return scope.capture;
}
