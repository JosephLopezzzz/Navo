import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { TOMTOM_API_KEY } from './tomtom';

export function createDestinationMapStyle(dark: boolean): StyleSpecification | null {
  if (!TOMTOM_API_KEY) return null;
  return {
    version: 8,
    sources: { tomtom: {
      type: 'raster', tileSize: 256, attribution: '© TomTom, © OpenStreetMap',
      tiles: [`https://api.tomtom.com/maps/orbis/display/raster/tile/{z}/{x}/{y}?apiVersion=2&key=${encodeURIComponent(TOMTOM_API_KEY)}&style=${dark ? 'street-dark' : 'street-light'}&tileSize=256&geopoliticalView=PH`],
    } },
    layers: [{ id: 'tomtom-raster', type: 'raster', source: 'tomtom' }],
  };
}
