/** Picker-only schematic colours. Route data and the global Navo palette stay independent. */
const railDiagramPalettes = {
  'lrt-1': {
    light: { rail: '#008D24', ball: '#08A72E', ballEdge: '#007C20', wash: '#E7F5EA', text: '#006E1D' },
    dark: { rail: '#57D77A', ball: '#57D77A', ballEdge: '#89EBA3', wash: '#123720', text: '#89EBA3' },
  },
  'lrt-2': {
    light: { rail: '#8613C4', ball: '#981BCE', ballEdge: '#740AB0', wash: '#F1E8FA', text: '#7412AF' },
    dark: { rail: '#C78AF4', ball: '#C78AF4', ballEdge: '#DEB3FF', wash: '#30203E', text: '#DEB3FF' },
  },
  'mrt-3': {
    light: { rail: '#006DE0', ball: '#087DED', ballEdge: '#0064CF', wash: '#E5F0FF', text: '#0059B8' },
    dark: { rail: '#6DB4FF', ball: '#6DB4FF', ballEdge: '#A1CFFF', wash: '#142F4C', text: '#A1CFFF' },
  },
} as const;

export function getRailDiagramPalette(lineId: string, isDark: boolean) {
  const palette = railDiagramPalettes[lineId as keyof typeof railDiagramPalettes] ?? railDiagramPalettes['lrt-1'];
  return palette[isDark ? 'dark' : 'light'];
}

export type RailDiagramPalette = ReturnType<typeof getRailDiagramPalette>;

export const railDiagramMetrics = {
  targetSize: 48,
  ballSize: 22,
  selectedSize: 34,
  railWidth: 4,
  labelFontSize: 14,
  labelLineHeight: 20,
  hoverScale: 1.12,
  pressScale: 1.20,
  pressDuration: 110,
  releaseDuration: 140,
} as const;
