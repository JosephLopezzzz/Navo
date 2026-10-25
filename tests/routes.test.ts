import { describe, expect, it } from 'vitest';
import { makeJourneyRoute, railLines } from '../src/data/routes';

describe('bundled rail route data', () => {
  it('includes the expected operator station sequences without guessed coordinates', () => {
    expect(railLines.map((line) => line.stops.length)).toEqual([25, 13, 13]);
    expect(railLines.every((line) => line.coordinateStatus === 'missing')).toBe(true);
    expect(railLines.every((line) => line.stops.every((stop) => stop.latitude === undefined && stop.longitude === undefined))).toBe(true);
  });

  it('cuts a forward trip to the selected ordered stop range', () => {
    const journey = makeJourneyRoute(railLines[0]!, 2, 5);
    expect(journey?.stops.map((stop) => stop.name)).toEqual(['Monumento', '5th Avenue', 'R. Papa', 'Abad Santos']);
    expect(journey?.direction).toBe('Monumento to Abad Santos');
    expect(journey?.coordinateStatus).toBe('missing');
  });

  it('reverses the same segment when the rider travels in the opposite direction', () => {
    const journey = makeJourneyRoute(railLines[0]!, 5, 2);
    expect(journey?.stops.map((stop) => stop.name)).toEqual(['Abad Santos', 'R. Papa', '5th Avenue', 'Monumento']);
    expect(journey?.direction).toBe('Abad Santos to Monumento');
  });

  it('requires different boarding and destination stops', () => {
    expect(makeJourneyRoute(railLines[1]!, 4, 4)).toBeNull();
  });
});