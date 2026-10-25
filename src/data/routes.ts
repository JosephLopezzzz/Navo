import type { Stop, TransitRoute } from '../domain/models';

const lrt1NorthToSouth = [
  'Fernando Poe Jr.', 'Balintawak', 'Monumento', '5th Avenue', 'R. Papa', 'Abad Santos',
  'Blumentritt', 'Tayuman', 'Bambang', 'Doroteo Jose', 'Carriedo', 'Central Terminal',
  'United Nations', 'Pedro Gil', 'Quirino', 'Vito Cruz', 'Gil Puyat', 'Libertad', 'EDSA',
  'Baclaran', 'Redemptorist–Aseana', 'MIA Road', 'PITX', 'Ninoy Aquino Avenue', 'Dr. Santos',
];

const lrt2EastToWest = [
  'Antipolo', 'Marikina–Pasig', 'Santolan', 'Katipunan', 'Anonas', 'Araneta Center–Cubao',
  'Betty Go-Belmonte', 'Gilmore', 'J. Ruiz', 'V. Mapa', 'Pureza', 'Legarda', 'Recto',
];

const mrt3NorthToSouth = [
  'North Avenue', 'Quezon Avenue', 'GMA Kamuning', 'Araneta–Cubao', 'Santolan–Annapolis',
  'Ortigas', 'Shaw Boulevard', 'Boni', 'Guadalupe', 'Buendia', 'Ayala', 'Magallanes', 'Taft Avenue',
];

function makeStops(prefix: string, names: string[]): Stop[] {
  return names.map((name, index) => ({ id: `${prefix}-${index + 1}`, name }));
}

export const railLines: TransitRoute[] = [
  {
    id: 'lrt-1', name: 'LRT-1', mode: 'rail', direction: 'Fernando Poe Jr. to Dr. Santos',
    dataQuality: 'preview', coordinateStatus: 'missing',
    sourceLabel: 'Station order from LRTA Railway Operations; station coordinates are not included.',
    sourceUrl: 'https://www.lrta.gov.ph/railway-operations/', stops: makeStops('lrt1', lrt1NorthToSouth),
  },
  {
    id: 'lrt-2', name: 'LRT-2', mode: 'rail', direction: 'Antipolo to Recto',
    dataQuality: 'preview', coordinateStatus: 'missing',
    sourceLabel: 'Station order from LRTA Railway Operations; station coordinates are not included.',
    sourceUrl: 'https://www.lrta.gov.ph/railway-operations/', stops: makeStops('lrt2', lrt2EastToWest),
  },
  {
    id: 'mrt-3', name: 'MRT-3', mode: 'rail', direction: 'North Avenue to Taft Avenue',
    dataQuality: 'preview', coordinateStatus: 'missing',
    sourceLabel: 'Station order from the DOTr-MRT3 fare matrix; station coordinates are not included.',
    sourceUrl: 'https://www.dotrmrt3.gov.ph/fare-matrix.pdf', stops: makeStops('mrt3', mrt3NorthToSouth),
  },
];

export function makeJourneyRoute(line: TransitRoute, boardingIndex: number, destinationIndex: number): TransitRoute | null {
  if (boardingIndex === destinationIndex) return null;
  const start = Math.min(boardingIndex, destinationIndex);
  const end = Math.max(boardingIndex, destinationIndex);
  const segment = line.stops.slice(start, end + 1);
  const stops = boardingIndex < destinationIndex ? segment : [...segment].reverse();
  return {
    ...line,
    coordinateStatus: stops.every((stop) => stop.latitude !== undefined && stop.longitude !== undefined) ? 'complete' : 'missing',
    id: `${line.id}:${line.stops[boardingIndex]?.id}:${line.stops[destinationIndex]?.id}`,
    direction: `${line.stops[boardingIndex]?.name} to ${line.stops[destinationIndex]?.name}`,
    stops,
  };
}
