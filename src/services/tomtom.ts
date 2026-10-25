import type { DestinationKind, SavedDestination } from '../domain/models';

export const TOMTOM_API_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY?.trim() ?? '';
const SEARCH_ROOT = 'https://api.tomtom.com/maps/orbis/places';

export interface TomTomPlaceSuggestion {
  id: string;
  type: string;
  title: string;
  subtitles: string[];
}

interface TomTomPosition {
  type?: string;
  coordinates?: unknown;
}

interface TomTomPlaceResponse extends TomTomPlaceSuggestion {
  position?: TomTomPosition;
}

function errorForStatus(status: number): Error {
  if (status === 403) return new Error('TomTom could not use this API key. Check its product access and restrictions.');
  if (status === 429) return new Error('TomTom search is busy. Wait a moment and try again.');
  return new Error('TomTom search is unavailable right now. Check your connection and try again.');
}

function requireApiKey(): string {
  if (!TOMTOM_API_KEY) throw new Error('Add EXPO_PUBLIC_TOMTOM_API_KEY to your local environment to use map search.');
  return TOMTOM_API_KEY;
}

function searchHeaders(sessionId: string): HeadersInit {
  return {
    'TomTom-Api-Key': requireApiKey(),
    'TomTom-Api-Version': '3',
    'Session-Id': sessionId,
    Attributes: 'results(id,type,title,subtitles)',
    'Accept-Language': 'en-PH,en',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export function createPlacesSearchSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export async function suggestPlaces(query: string, sessionId: string, signal?: AbortSignal): Promise<TomTomPlaceSuggestion[]> {
  const response = await fetch(`${SEARCH_ROOT}/suggest`, {
    method: 'POST',
    headers: searchHeaders(sessionId),
    body: JSON.stringify({
      query,
      maxResults: 7,
      filters: { countryCodesIso2: ['PH'] },
    }),
    signal,
  });
  if (!response.ok) throw errorForStatus(response.status);
  const body = await response.json() as { results?: unknown };
  if (!Array.isArray(body.results)) return [];
  return body.results.filter((result): result is TomTomPlaceSuggestion => {
    if (!result || typeof result !== 'object') return false;
    const candidate = result as Partial<TomTomPlaceSuggestion>;
    return typeof candidate.id === 'string'
      && typeof candidate.type === 'string'
      && candidate.type !== 'discoverAction'
      && typeof candidate.title === 'string';
  }).map((result) => ({ ...result, subtitles: Array.isArray(result.subtitles) ? result.subtitles : [] }));
}

const detailsTypeBySuggestionType: Record<string, string | undefined> = {
  poi: 'pois',
  address: 'addresses',
  street: 'streets',
  intersection: 'intersections',
  area: 'areas',
};

function coordinatesFromPosition(position: TomTomPosition | undefined): [number, number] | null {
  const coordinates = position?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return [longitude, latitude];
}

export async function resolvePlaceSuggestion(
  suggestion: TomTomPlaceSuggestion,
  sessionId: string,
  kind: DestinationKind,
  signal?: AbortSignal,
): Promise<Omit<SavedDestination, 'id' | 'createdAt' | 'updatedAt'>> {
  const detailsType = detailsTypeBySuggestionType[suggestion.type];
  if (!detailsType) throw new Error('Choose a specific point of interest or address, or place a pin on the map.');
  const response = await fetch(`${SEARCH_ROOT}/details/${detailsType}/${encodeURIComponent(suggestion.id)}`, {
    headers: {
      'TomTom-Api-Key': requireApiKey(),
      'TomTom-Api-Version': '3',
      'Session-Id': sessionId,
      Attributes: 'id,type,title,subtitles,position,address',
      'Accept-Language': 'en-PH,en',
      Accept: 'application/json',
    },
    signal,
  });
  if (!response.ok) throw errorForStatus(response.status);
  const result = await response.json() as TomTomPlaceResponse;
  const position = coordinatesFromPosition(result.position);
  if (!position) throw new Error('TomTom did not return a precise point for that result. Place a pin on the map instead.');
  return {
    name: result.title || suggestion.title,
    subtitle: (result.subtitles ?? suggestion.subtitles).filter(Boolean).join(' · '),
    longitude: position[0],
    latitude: position[1],
    kind,
    source: 'tomtom',
    providerPlaceId: result.id || suggestion.id,
  };
}

export async function fetchMapAttribution(): Promise<string | null> {
  if (!TOMTOM_API_KEY) return null;
  try {
    const response = await fetch('https://api.tomtom.com/maps/orbis/copyrights/caption?apiVersion=2&key=' + encodeURIComponent(TOMTOM_API_KEY), {
      headers: { 'TomTom-Api-Version': '2' },
    });
    if (!response.ok) return null;
    const result = await response.json() as { copyrightsCaption?: unknown };
    return typeof result.copyrightsCaption === 'string' ? result.copyrightsCaption : null;
  } catch {
    return null;
  }
}
