import { railDiagramMetrics } from './rail-diagram-tokens';

type DiagramStation = { id: string; name: string };
type OrderedStation = DiagramStation & { lineId: string; stopId: string };
type LabelSide = 'left' | 'right';
type StationShape = { x: number; side?: LabelSide };

export interface RailDiagramNode {
  stationId: string;
  position: number;
  x: number;
  y: number;
  label: { x: number; y: number; width: number; height: number; textAlign: 'left' | 'right' | 'center' };
  target: { x: number; y: number; width: number; height: number };
}

export interface RailDiagramLayout {
  width: number;
  height: number;
  nodes: RailDiagramNode[];
  connectorPath: string;
  compact: boolean;
}

// These are schematic positions keyed to stable station IDs, never search-result indexes.
const stationShapes: Record<string, StationShape> = {
  'lrt-1-fernando-poe-jr': { x: 5 / 6 },
  'lrt-1-balintawak': { x: 1 / 2 },
  'lrt-1-monumento': { x: 1 / 6 },
  'lrt-1-5th-avenue': { x: 0.10 },
  'lrt-1-r-papa': { x: 0.10 },
  'lrt-1-abad-santos': { x: 0.10 },
  'lrt-1-blumentritt': { x: 0.10 },
  'lrt-1-tayuman': { x: 0.10 },
  'lrt-1-bambang': { x: 0.10 },
  'lrt-1-doroteo-jose': { x: 0.10 },
  'lrt-1-carriedo': { x: 0.10 },
  'lrt-1-central-terminal': { x: 0.28 },
  'lrt-1-united-nations': { x: 0.56, side: 'right' },
  'lrt-1-pedro-gil': { x: 0.73, side: 'left' },
  'lrt-1-quirino': { x: 0.78, side: 'left' },
  'lrt-1-vito-cruz': { x: 0.78, side: 'left' },
  'lrt-1-gil-puyat': { x: 0.79, side: 'left' },
  'lrt-1-libertad': { x: 0.80, side: 'left' },
  'lrt-1-edsa': { x: 0.80, side: 'left' },
  'lrt-1-baclaran': { x: 0.78, side: 'left' },
  'lrt-1-redemptorist-aseana': { x: 0.73, side: 'left' },
  'lrt-1-mia-road': { x: 0.73, side: 'left' },
  'lrt-1-pitx': { x: 0.72, side: 'left' },
  'lrt-1-ninoy-aquino-avenue': { x: 0.74, side: 'left' },
  'lrt-1-dr-santos': { x: 0.66, side: 'left' },
  'lrt-2-recto': { x: 0.11 },
  'lrt-2-legarda': { x: 0.08 },
  'lrt-2-pureza': { x: 0.08 },
  'lrt-2-v-mapa': { x: 0.17 },
  'lrt-2-j-ruiz': { x: 0.28 },
  'lrt-2-gilmore': { x: 0.38 },
  'lrt-2-betty-go-belmonte': { x: 0.50 },
  'lrt-2-araneta-center-cubao': { x: 0.62, side: 'right' },
  'lrt-2-anonas': { x: 0.65, side: 'left' },
  'lrt-2-katipunan': { x: 0.78, side: 'right' },
  'lrt-2-santolan': { x: 0.60, side: 'left' },
  'lrt-2-marikina-pasig': { x: 0.53, side: 'left' },
  'lrt-2-antipolo': { x: 0.69, side: 'right' },
  'mrt-3-north-avenue': { x: 0.11 },
  'mrt-3-quezon-avenue': { x: 0.27 },
  'mrt-3-gma-kamuning': { x: 0.39 },
  'mrt-3-araneta-cubao': { x: 0.53, side: 'right' },
  'mrt-3-santolan-annapolis': { x: 0.68, side: 'right' },
  'mrt-3-ortigas': { x: 0.71, side: 'right' },
  'mrt-3-shaw-boulevard': { x: 0.70, side: 'right' },
  'mrt-3-boni': { x: 0.65, side: 'right' },
  'mrt-3-guadalupe': { x: 0.58, side: 'right' },
  'mrt-3-buendia': { x: 0.49, side: 'right' },
  'mrt-3-ayala': { x: 0.41 },
  'mrt-3-magallanes': { x: 0.27 },
  'mrt-3-taft-avenue': { x: 0.09 },
};

/** A picker presentation only: canonical route order and persistence are untouched. */
export function getRailDiagramStations<T extends OrderedStation>(lineId: string, stations: readonly T[]): T[] {
  const ordered = stations.filter((station) => station.lineId === lineId).sort((a, b) => {
    const aPosition = Number(a.stopId.match(/-(\d+)$/)?.[1] ?? 0);
    const bPosition = Number(b.stopId.match(/-(\d+)$/)?.[1] ?? 0);
    return aPosition - bPosition;
  });
  return lineId === 'lrt-2' ? ordered.reverse() : ordered;
}

// Geometry uses the existing 16/10/6 spacing values; independent of React Native for layout proof.
const edgeInset = 16;
const labelGap = 10;
const rowGap = 6;
const labelPadding = 6;

function estimateLabelHeight(name: string, width: number, fontScale: number): number {
  // Reserve conservatively before native text reports its actual wrapped height.
  const characterWidth = railDiagramMetrics.labelFontSize * fontScale * 0.64;
  const capacity = Math.max(1, Math.floor(width / characterWidth));
  let lines = 1;
  let used = 0;
  for (const word of name.split(/\s+/)) {
    if (used && used + 1 + word.length <= capacity) { used += 1 + word.length; continue; }
    if (used && used + 1 + word.length > capacity) { lines += 1; used = 0; }
    const wordLines = Math.ceil(word.length / capacity);
    lines += wordLines - 1;
    used = word.length % capacity || capacity;
  }
  return Math.ceil(lines * railDiagramMetrics.labelLineHeight * fontScale);
}

function makeConnector(nodes: readonly RailDiagramNode[], width: number): string {
  if (nodes.length < 2) return '';
  const round = (value: number) => Number(value.toFixed(2));
  const coordinate = (x: number, y: number) => `${round(x)} ${round(y)}`;
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
  const commands = [`M ${coordinate(nodes[0]!.x, nodes[0]!.y)}`];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const previous = nodes[Math.max(0, index - 1)]!;
    const start = nodes[index]!;
    const end = nodes[index + 1]!;
    const next = nodes[Math.min(nodes.length - 1, index + 2)]!;
    if (start.y === end.y) { commands.push(`L ${coordinate(end.x, end.y)}`); continue; }
    const c1x = clamp(start.x + (end.x - previous.x) / 6, 0, width);
    const c1y = clamp(start.y + (end.y - previous.y) / 6, start.y, end.y);
    const c2x = clamp(end.x - (next.x - start.x) / 6, 0, width);
    const c2y = clamp(end.y - (next.y - start.y) / 6, start.y, end.y);
    commands.push(`C ${coordinate(c1x, c1y)}, ${coordinate(c2x, c2y)}, ${coordinate(end.x, end.y)}`);
  }
  return commands.join(' ');
}

/** Stations must already be in getRailDiagramStations presentation order. */
export function createRailDiagramLayout({
  lineId, stations, width: availableWidth, fontScale: requestedScale = 1, labelHeights = {}, searchResults = false, stackTopStations = false,
}: {
  lineId: string;
  stations: readonly DiagramStation[];
  width: number;
  fontScale?: number;
  labelHeights?: Readonly<Record<string, number>>;
  searchResults?: boolean;
  /** Keep LRT-1 route traversal top to bottom when a screen reader is active. */
  stackTopStations?: boolean;
}): RailDiagramLayout {
  const width = Math.max(railDiagramMetrics.targetSize, Number.isFinite(availableWidth) ? availableWidth : 320);
  const fontScale = Math.max(1, Number.isFinite(requestedScale) ? requestedScale : 1);
  const compact = width < 300 || fontScale > 1.4 || (lineId === 'lrt-1' && stackTopStations);
  const nodes: RailDiagramNode[] = [];
  const halfTarget = railDiagramMetrics.targetSize / 2;
  let nextY = edgeInset;
  const labelHeight = (station: DiagramStation, labelWidth: number) => {
    const measuredHeight = labelHeights[station.id];
    // Native wrapping is authoritative once measured; estimates only reserve the first frame.
    if (typeof measuredHeight === 'number' && Number.isFinite(measuredHeight) && measuredHeight > 0) {
      return Math.max(railDiagramMetrics.labelLineHeight * fontScale, measuredHeight);
    }
    return estimateLabelHeight(station.name, labelWidth, fontScale);
  };
  const topIds = ['lrt-1-fernando-poe-jr', 'lrt-1-balintawak', 'lrt-1-monumento'];
  const topStations = !searchResults && !compact && lineId === 'lrt-1'
    ? stations.filter((station) => topIds.includes(station.id)) : [];

  if (topStations.length === 3) {
    const cellWidth = width / 3;
    const textWidth = cellWidth - labelPadding * 2;
    const maxLabelHeight = Math.max(...topStations.map((station) => labelHeight(station, textWidth)));
    const height = maxLabelHeight + labelGap + railDiagramMetrics.targetSize;
    for (const station of topStations) {
      const x = stationShapes[station.id]!.x * width;
      const heightForLabel = labelHeight(station, textWidth);
      const cellX = x - cellWidth / 2;
      nodes.push({
        stationId: station.id, position: stations.findIndex((item) => item.id === station.id) + 1,
        x, y: nextY + maxLabelHeight + labelGap + halfTarget,
        label: { x: cellX + labelPadding, y: nextY + maxLabelHeight - heightForLabel, width: textWidth, height: heightForLabel, textAlign: 'center' },
        target: { x: Math.max(0, cellX), y: nextY, width: cellWidth, height },
      });
    }
    nextY += height + rowGap;
  }

  for (const [index, station] of stations.entries()) {
    if (nodes.some((node) => node.stationId === station.id)) continue;
    const shape = searchResults ? { x: 0 } : stationShapes[station.id] ?? { x: 0.15 };
    const x = searchResults ? halfTarget : Math.max(halfTarget, Math.min(width - halfTarget, shape.x * width));
    const rightSpace = width - x - halfTarget - labelGap;
    const leftSpace = x - halfTarget - labelGap;
    let side: LabelSide = searchResults ? 'right' : shape.side ?? (shape.x > 0.56 ? 'left' : 'right');
    // At large text sizes, put names on the roomier side without changing the route shape.
    if (!searchResults && (fontScale > 1.4 || (side === 'right' ? rightSpace : leftSpace) < 64)) {
      side = leftSpace > rightSpace ? 'left' : 'right';
    }
    const labelX = side === 'right' ? x + halfTarget + labelGap : edgeInset;
    const labelWidth = Math.max(1, side === 'right' ? width - labelX : x - halfTarget - labelGap - edgeInset);
    const heightForLabel = labelHeight(station, labelWidth);
    const height = Math.max(railDiagramMetrics.targetSize, heightForLabel + labelPadding * 2);
    const targetX = side === 'right' ? x - halfTarget : edgeInset;
    const targetRight = side === 'right' ? width : x + halfTarget;
    nodes.push({
      stationId: station.id, position: index + 1, x, y: nextY + height / 2,
      label: { x: labelX, y: nextY + (height - heightForLabel) / 2, width: labelWidth, height: heightForLabel, textAlign: side === 'right' ? 'left' : 'right' },
      target: { x: targetX, y: nextY, width: targetRight - targetX, height },
    });
    nextY += height + rowGap;
  }
  nodes.sort((a, b) => a.position - b.position);
  return { width, height: nodes.length ? nextY + edgeInset - rowGap : 0, nodes, connectorPath: searchResults ? '' : makeConnector(nodes, width), compact };
}
