import type { DestinationKind, SavedDestination } from '../domain/models';

export const TOMTOM_API_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY?.trim() ?? '';
const SEARCH_ROOT = 'https://api.tomtom.com/maps/orbis/places';
const MAP_ATTRIBUTION_TIMEOUT_MS = 4_000;

let cachedMapAttribution: string | null = null;
let mapAttributionRequest: Promise<string | null> | null = null;

export interface TomTomPlaceSuggestion {
  id: string;
  type: string;
  title: string;
  subtitles: string[];
  distanceInMeters?: number;
}

interface TomTomPosition {
  type?: string;
  coordinates?: unknown;
}

interface TomTomPlaceResponse extends TomTomPlaceSuggestion {
  position?: TomTomPosition;
}

interface TomTomReverseGeocodeResult {
  title?: unknown;
  address?: {
    street?: unknown;
    houseNumber?: unknown;
    neighborhood?: unknown;
    municipalitySubdivision?: unknown;
    municipality?: unknown;
    countrySubdivision?: unknown;
  };
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

async function fetchSearch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const originalSignal = init.signal;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15_000);
  const abortFromCaller = () => controller.abort();

  if (originalSignal?.aborted) controller.abort();
  else originalSignal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error('Search took too long. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
    originalSignal?.removeEventListener('abort', abortFromCaller);
  }
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
  const response = await fetchSearch(`${SEARCH_ROOT}/suggest`, {
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

export async function discoverNearbyPlaces(
  kind: DestinationKind,
  origin: { latitude: number; longitude: number },
  sessionId: string,
  signal?: AbortSignal,
  query?: string,
): Promise<TomTomPlaceSuggestion[]> {
  if (kind === 'rail-station') return [];
  const headers = {
    ...searchHeaders(sessionId),
    Attributes: 'results(id,type,title,subtitles,position,distanceInMeters)',
  };
  const radiusInMeters = 5000;
  const response = await fetchSearch(`${SEARCH_ROOT}/discover`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: query ?? (kind === 'bus-dropoff' ? 'bus station' : ''),
      origin: { type: 'point', coordinates: [origin.longitude, origin.latitude] },
      maxResults: 8,
      filters: {
        types: ['poi'],
        countryCodesIso2: ['PH'],
        geometry: { type: 'circle', center: [origin.longitude, origin.latitude], radiusInMeters },
      },
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
      && candidate.type === 'poi'
      && typeof candidate.title === 'string';
  }).map((result) => ({
    ...result,
    subtitles: Array.isArray(result.subtitles) ? result.subtitles : [],
    ...(Number.isFinite(result.distanceInMeters) ? { distanceInMeters: result.distanceInMeters } : {}),
  }));
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
  const response = await fetchSearch(`${SEARCH_ROOT}/details/${detailsType}/${encodeURIComponent(suggestion.id)}`, {
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

export async function reverseGeocodeCoordinate(
  coordinate: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<{ name: string; subtitle: string } | null> {
  const position = `${coordinate.longitude},${coordinate.latitude}`;
  const query = `position=${encodeURIComponent(position)}&radiusInMeters=100&geopoliticalView=PH`;
  const response = await fetchSearch(`${SEARCH_ROOT}/reverseGeocode?${query}`, {
    headers: {
      'TomTom-Api-Key': requireApiKey(),
      'TomTom-Api-Version': '2',
      Attributes: 'results(title,type,address)',
      'Accept-Language': 'en-PH,en',
      Accept: 'application/json',
    },
    signal,
  });
  if (!response.ok) throw errorForStatus(response.status);

  const body = await response.json() as { results?: unknown };
  if (!Array.isArray(body.results)) return null;
  const result = body.results.find((item): item is TomTomReverseGeocodeResult => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as TomTomReverseGeocodeResult;
    return typeof candidate.title === 'string' || Boolean(candidate.address?.street);
  });
  if (!result) return null;

  const address = result.address;
  const streetLine = [address?.houseNumber, address?.street]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ');
  const name = typeof result.title === 'string' && result.title.trim()
    ? result.title.trim()
    : streetLine;
  if (!name) return null;

  const subtitleParts = [
    address?.neighborhood,
    address?.municipalitySubdivision,
    address?.municipality,
    address?.countrySubdivision,
  ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
  const uniqueParts = [...new Map(subtitleParts.map((part) => [part.trim().toLocaleLowerCase(), part.trim()])).values()]
    .filter((part) => !name.toLocaleLowerCase().includes(part.toLocaleLowerCase()));

  return { name, subtitle: uniqueParts.join(' · ') };
}

export async function fetchMapAttribution(): Promise<string | null> {
  if (!TOMTOM_API_KEY) return null;
  if (cachedMapAttribution) return cachedMapAttribution;
  if (mapAttributionRequest) return mapAttributionRequest;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAP_ATTRIBUTION_TIMEOUT_MS);
    try {
      const response = await fetch('https://api.tomtom.com/maps/orbis/copyrights/caption?apiVersion=2&key=' + encodeURIComponent(TOMTOM_API_KEY), {
        headers: { 'TomTom-Api-Version': '2' },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const result = await response.json() as { copyrightsCaption?: unknown };
      cachedMapAttribution = typeof result.copyrightsCaption === 'string' ? result.copyrightsCaption : null;
      return cachedMapAttribution;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();
  mapAttributionRequest = request;
  void request.finally(() => {
    if (mapAttributionRequest === request) mapAttributionRequest = null;
  });
  return request;
}
