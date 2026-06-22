import * as THREE from 'three';
import { Edge } from './seamEditor';
import { flattenGeometry } from './flattenEngine';

// ── Types ────────────────────────────────────────────────────────────────────
export interface Panel {
  id: string;
  index: number;
  label: string;               // "Panel A", "Panel B", etc.
  color: string;
  faceIndices: number[];       // which original faces belong to this panel
  geometry: THREE.BufferGeometry;
  flatResult: { flat2d: [number, number][]; distortion: number[] } | null;
  area3d: number;
  area2d: number;
  boundingBox2d: { minX: number; maxX: number; minY: number; maxY: number } | null;
  vertexCount: number;
  faceCount: number;
}

export interface PanelLayout {
  panels: Panel[];
  totalArea3d: number;
  totalArea2d: number;
  seamCount: number;
}

// ── Panel color palette ───────────────────────────────────────────────────────
export const PANEL_COLORS = [
  '#4a7ae8', // blue
  '#e84a4a', // red
  '#4ecb71', // green
  '#e8c84a', // yellow
  '#a44ae8', // purple
  '#e87c3a', // orange
  '#4ae8d4', // cyan
  '#e84aa0', // pink
  '#8ae84a', // lime
  '#e8a44a', // amber
  '#4a4ae8', // indigo
  '#e84a74', // rose
];

const PANEL_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── Compute face area ─────────────────────────────────────────────────────────
function faceArea3d(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, a: number, b: number, c: number): number {
  const va = new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
  const vb = new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
  const vc = new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));
  return vb.sub(va).cross(vc.sub(va)).length() / 2;
}

// ── Build face adjacency respecting seam edges ────────────────────────────────
function buildFaceAdjacency(
  geo: THREE.BufferGeometry,
  seamEdgeIds: Set<string>,
  edgeMap: Map<string, Edge>
): Map<number, number[]> {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const faceCount = idx ? idx.count / 3 : pos.count / 3;

  // face index → adjacent face indices (not crossing seams)
  const adj = new Map<number, number[]>();
  for (let i = 0; i < faceCount; i++) adj.set(i, []);

  // For each edge, if it's not a seam, connect the two faces it borders
  for (const [edgeId, edge] of edgeMap) {
    if (seamEdgeIds.has(edgeId)) continue;   // seam — do NOT connect
    if (edge.isBoundary) continue;            // only 1 face — skip
    if (edge.faces.length < 2) continue;

    const [f0, f1] = edge.faces;
    adj.get(f0)!.push(f1);
    adj.get(f1)!.push(f0);
  }

  return adj;
}

// ── Flood fill to find connected face regions ─────────────────────────────────
function floodFillPanels(
  faceCount: number,
  adj: Map<number, number[]>
): number[][] {
  const visited = new Uint8Array(faceCount);
  const panels: number[][] = [];

  for (let start = 0; start < faceCount; start++) {
    if (visited[start]) continue;
    const region: number[] = [];
    const stack = [start];
    visited[start] = 1;

    while (stack.length > 0) {
      const fi = stack.pop()!;
      region.push(fi);
      for (const nb of (adj.get(fi) || [])) {
        if (!visited[nb]) {
          visited[nb] = 1;
          stack.push(nb);
        }
      }
    }

    panels.push(region);
  }

  return panels;
}

// ── Extract sub-geometry for a panel ─────────────────────────────────────────
function extractPanelGeometry(
  srcGeo: THREE.BufferGeometry,
  faceIndices: number[]
): THREE.BufferGeometry {
  const srcPos = srcGeo.attributes.position;
  const srcIdx = srcGeo.index;

  // Collect unique vertices used by these faces
  const vertMap = new Map<number, number>(); // old → new index
  const newPositions: number[] = [];
  const newIndices: number[] = [];

  const getFaceVerts = (fi: number): [number, number, number] => {
    if (srcIdx) {
      return [srcIdx.getX(fi * 3), srcIdx.getX(fi * 3 + 1), srcIdx.getX(fi * 3 + 2)];
    }
    return [fi * 3, fi * 3 + 1, fi * 3 + 2];
  };

  for (const fi of faceIndices) {
    const [a, b, c] = getFaceVerts(fi);
    for (const v of [a, b, c]) {
      if (!vertMap.has(v)) {
        const ni = newPositions.length / 3;
        vertMap.set(v, ni);
        newPositions.push(srcPos.getX(v), srcPos.getY(v), srcPos.getZ(v));
      }
    }
    newIndices.push(vertMap.get(a)!, vertMap.get(b)!, vertMap.get(c)!);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  geo.setIndex(newIndices);
  geo.computeVertexNormals();
  return geo;
}

// ── Compute 2D bounding box ───────────────────────────────────────────────────
function compute2dBBox(flat2d: [number, number][]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of flat2d) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

// ── Compute flat panel area ───────────────────────────────────────────────────
function computeArea2d(flat2d: [number, number][], faces: number[][]): number {
  let area = 0;
  for (const [a, b, c] of faces) {
    const [ax, ay] = flat2d[a] || [0, 0];
    const [bx, by] = flat2d[b] || [0, 0];
    const [cx, cy] = flat2d[c] || [0, 0];
    area += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
  }
  return area;
}

// ── Main entry: split mesh into panels ────────────────────────────────────────
export function splitMeshIntoPanels(
  geo: THREE.BufferGeometry,
  seamEdgeIds: Set<string>,
  edgeMap: Map<string, Edge>,
  algorithm: 'ARAP' | 'LSCM' | 'Projection'
): PanelLayout {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const faceCount = idx ? idx.count / 3 : pos.count / 3;

  // Build adjacency respecting seams
  const adj = buildFaceAdjacency(geo, seamEdgeIds, edgeMap);

  // Flood fill → panel regions
  const regions = floodFillPanels(faceCount, adj);

  // Sort by size (largest first)
  regions.sort((a, b) => b.length - a.length);

  // Build Panel objects
  const panels: Panel[] = regions.map((faceIndices, i) => {
    const label = i < PANEL_LABELS.length ? `Panel ${PANEL_LABELS[i]}` : `Panel ${i + 1}`;
    const color = PANEL_COLORS[i % PANEL_COLORS.length];
    const panelGeo = extractPanelGeometry(geo, faceIndices);

    // Compute 3D area
    const panelPos = panelGeo.attributes.position;
    const panelIdx = panelGeo.index!;
    let area3d = 0;
    for (let fi = 0; fi < panelIdx.count / 3; fi++) {
      area3d += faceArea3d(panelPos, panelIdx.getX(fi*3), panelIdx.getX(fi*3+1), panelIdx.getX(fi*3+2));
    }

    // Flatten panel
    let flatResult: { flat2d: [number, number][]; distortion: number[] } | null = null;
    let area2d = 0;
    let boundingBox2d = null;

    try {
      flatResult = flattenGeometry(panelGeo, algorithm);
      const pFaces: number[][] = [];
      for (let fi = 0; fi < panelIdx.count / 3; fi++) {
        pFaces.push([panelIdx.getX(fi*3), panelIdx.getX(fi*3+1), panelIdx.getX(fi*3+2)]);
      }
      area2d = computeArea2d(flatResult.flat2d, pFaces);
      boundingBox2d = compute2dBBox(flatResult.flat2d);
    } catch (e) {
      console.warn(`Panel ${label} flattening failed:`, e);
    }

    return {
      id: `panel-${i}`,
      index: i,
      label,
      color,
      faceIndices,
      geometry: panelGeo,
      flatResult,
      area3d,
      area2d,
      boundingBox2d,
      vertexCount: panelGeo.attributes.position.count,
      faceCount: faceIndices.length,
    };
  });

  const totalArea3d = panels.reduce((s, p) => s + p.area3d, 0);
  const totalArea2d = panels.reduce((s, p) => s + p.area2d, 0);

  return { panels, totalArea3d, totalArea2d, seamCount: seamEdgeIds.size };
}

// ── Arrange panels for nesting (simple row-based layout) ──────────────────────
export interface LayoutItem {
  panelId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function arrangePanels(
  panels: Panel[],
  padding: number = 20,
  seamAllowance: number = 10
): LayoutItem[] {
  const items: LayoutItem[] = [];
  let curX = padding;
  let curY = padding;
  let rowHeight = 0;
  const maxWidth = 800;

  for (const panel of panels) {
    if (!panel.boundingBox2d) continue;
    const { minX, maxX, minY, maxY } = panel.boundingBox2d;
    const w = (maxX - minX) + seamAllowance * 2;
    const h = (maxY - minY) + seamAllowance * 2;

    // Scale to canvas units
    const SCALE = Math.min(160 / (w || 1), 160 / (h || 1));
    const sw = w * SCALE;
    const sh = h * SCALE;

    if (curX + sw > maxWidth - padding && items.length > 0) {
      curX = padding;
      curY += rowHeight + padding;
      rowHeight = 0;
    }

    items.push({ panelId: panel.id, x: curX, y: curY, width: sw, height: sh });
    curX += sw + padding;
    rowHeight = Math.max(rowHeight, sh);
  }

  return items;
}
