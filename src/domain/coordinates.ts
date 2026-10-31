export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Parses decimal coordinates in latitude, longitude order. */
export function parseCoordinates(value: string): Coordinates | null {
  const parts = value.trim().split(/\s*[,;]\s*/);
  if (parts.length !== 2 || !parts.every((part) => part.trim() !== '')) return null;

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
}

export function formatCoordinates({ latitude, longitude }: Coordinates): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}
