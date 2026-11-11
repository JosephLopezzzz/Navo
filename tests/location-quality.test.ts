import { describe, expect, it } from 'vitest';
import { getLocationFixProblem, MAX_USABLE_FIX_AGE_MS } from '../src/domain/location-quality';
import type { LocationFix } from '../src/domain/models';

const now = 1_000_000;
const good: LocationFix = { latitude: 14.6, longitude: 121, accuracyM: 10, timestamp: now };

describe('GPS reading quality', () => {
  it('accepts a fresh bounded reading and the exact accuracy/age limits', () => {
    expect(getLocationFixProblem(good, now)).toBeNull();
    expect(getLocationFixProblem({ ...good, accuracyM: 80, timestamp: now - MAX_USABLE_FIX_AGE_MS }, now)).toBeNull();
  });

  it.each([
    { override: { latitude: NaN }, reason: 'invalid' },
    { override: { latitude: 91 }, reason: 'invalid' },
    { override: { longitude: -181 }, reason: 'invalid' },
    { override: { timestamp: Infinity }, reason: 'invalid' },
    { override: { accuracyM: -1 }, reason: 'poor-accuracy' },
    { override: { accuracyM: null }, reason: 'poor-accuracy' },
    { override: { accuracyM: 81 }, reason: 'poor-accuracy' },
    { override: { timestamp: now - MAX_USABLE_FIX_AGE_MS - 1 }, reason: 'stale' },
    { override: { timestamp: now + 5_001 }, reason: 'future' },
  ])('rejects $reason readings without interpreting them as progress: $override', ({ override, reason }) => {
    expect(getLocationFixProblem({ ...good, ...override }, now)).toBe(reason);
  });

  it('rejects cached readings from before the selected alarm was armed', () => {
    expect(getLocationFixProblem({ ...good, timestamp: now - 1 }, now, now)).toBe('pre-session');
    expect(getLocationFixProblem(good, now, now)).toBeNull();
  });
});
