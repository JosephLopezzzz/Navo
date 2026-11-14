import { describe, expect, it, vi } from 'vitest';
import { createScreenActionScope } from '../src/hooks/useScreenActionScope';

vi.mock('expo-router', () => ({ useFocusEffect: vi.fn() }));

describe('screen action ownership', () => {
  it('permits completion only during the visit that started it', () => {
    const scope = createScreenActionScope();
    expect(scope.capture()()).toBe(false);
    const leave = scope.enter();
    const first = scope.capture();
    expect(first()).toBe(true);
    leave();
    expect(first()).toBe(false);
    scope.enter();
    expect(first()).toBe(false);
    expect(scope.capture()()).toBe(true);
  });

  it('does not let delayed cleanup invalidate a newer visit', () => {
    const scope = createScreenActionScope();
    const leaveOldVisit = scope.enter();
    scope.enter();
    const current = scope.capture();
    leaveOldVisit();
    expect(current()).toBe(true);
  });
});
