import { Panel } from './panelSplitter';

// ── Types ────────────────────────────────────────────────────────────────────
export interface SheetConfig {
  width: number;       // sheet width in mm (e.g. 1400)
  height: number;      // sheet height in mm (e.g. 2000)
  seamAllowance: number;
  allowRotation: boolean;
  respectGrain: boolean; // if true, only allow 0° and 180° rotation
}

export interface NestedItem {
  panelId: string;
  label: string;
  color: string;
  x: number;            // placement x on sheet (mm)
  y: number;            // placement y on sheet (mm)
  width: number;        // placed width (after rotation)
  height: number;       // placed height (after rotation)
  rotation: number;     // 0 or 90 degrees
  grainAngle: number;   // panel grain direction in degrees
  flat2d: [number, number][];
  faces: number[][];
  distortion: number[];
  boundingBox: { minX: number; maxX: number; minY: number; maxY: number };
  scale: number;        // mm per unit
}

export interface NestingResult {
  items: NestedItem[];
  sheetWidth: number;
  sheetHeight: number;
  usedArea: number;
  totalArea: number;
  efficiency: number;   // 0–1
  unplaced: string[];   // panel ids that didn't fit
}

// ── Compute panel bounding box dimensions ────────────────────────────────────
function getPanelDimensions(panel: Panel, seamAllowance: number): {
  w: number; h: number; scale: number;
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
} | null {
  if (!panel.flatResult || !panel.boundingBox2d) return null;
  const { minX, maxX, minY, maxY } = panel.boundingBox2d;
  const rawW = maxX - minX;
  const rawH = maxY - minY;
  if (rawW <= 0 || rawH <= 0) return null;

  // Scale: normalize largest dimension to ~200mm equivalent for display
  // The actual scale will be determined by sheet dimensions
  const scale = 1.0; // raw units; sheet config provides context

  const w = rawW + seamAllowance * 2;
  const h = rawH + seamAllowance * 2;
  return { w, h, scale, bbox: { minX, maxX, minY, maxY } };
}

// ── Guillotine bin-packing (Bottom-Left-Fill heuristic) ──────────────────────
interface FreeRect {
  x: number; y: number; w: number; h: number;
}

function tryPlace(
  rects: FreeRect[],
  itemW: number,
  itemH: number
): { rect: FreeRect; index: number } | null {
  // Find the bottom-left-most free rect that fits
  let best: { rect: FreeRect; index: number } | null = null;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.w >= itemW && r.h >= itemH) {
      if (!best || r.y < best.rect.y || (r.y === best.rect.y && r.x < best.rect.x)) {
        best = { rect: r, index: i };
      }
    }
  }
  return best;
}

function splitRect(placed: FreeRect, itemW: number, itemH: number, rects: FreeRect[]): FreeRect[] {
  // Split the used rect into two remainders (guillotine cut, horizontal split)
  const newRects: FreeRect[] = [];
  // Right of item
  if (placed.w - itemW > 1) {
    newRects.push({ x: placed.x + itemW, y: placed.y, w: placed.w - itemW, h: itemH });
  }
  // Above item
  if (placed.h - itemH > 1) {
    newRects.push({ x: placed.x, y: placed.y + itemH, w: placed.w, h: placed.h - itemH });
  }
  return [...rects.filter((_, i) => true), ...newRects];
}

// ── Main nesting function ─────────────────────────────────────────────────────
export function nestPanels(
  panels: Panel[],
  config: SheetConfig,
  grainAngles: Map<string, number>
): NestingResult {
  const { width, height, seamAllowance, allowRotation, respectGrain } = config;

  // Sort panels: largest area first (better packing)
  const sorted = [...panels]
    .filter(p => p.flatResult && p.boundingBox2d)
    .sort((a, b) => b.area2d - a.area2d);

  let freeRects: FreeRect[] = [{ x: 0, y: 0, w: width, h: height }];
  const items: NestedItem[] = [];
  const unplaced: string[] = [];

  for (const panel of sorted) {
    const dims = getPanelDimensions(panel, seamAllowance);
    if (!dims) { unplaced.push(panel.id); continue; }

    const grainAngle = grainAngles.get(panel.id) ?? 0;
    const { w: rawW, h: rawH, bbox } = dims;

    // Normalize panel dimensions to sheet coordinate space
    // sheet is in mm, panel dims are in model units
    // We use a normalization: panels fill the sheet proportionally
    const panelMaxDim = Math.max(rawW, rawH);
    const sheetMaxDim = Math.min(width, height) * 0.25; // max 25% of sheet per panel
    const mmScale = Math.min(sheetMaxDim / panelMaxDim, 1);

    const pW = rawW * mmScale;
    const pH = rawH * mmScale;

    // Try normal orientation
    const candidates: Array<{ w: number; h: number; rotation: number }> = [
      { w: pW, h: pH, rotation: 0 },
    ];

    // Add 90° rotation unless grain is respected and grain angle is constrained
    if (allowRotation && (!respectGrain || grainAngle % 180 === 0)) {
      candidates.push({ w: pH, h: pW, rotation: 90 });
    }

    let placed = false;
    for (const cand of candidates) {
      const fit = tryPlace(freeRects, cand.w, cand.h);
      if (fit) {
        const { rect, index } = fit;

        // Build face list
        const pidx = panel.geometry.index!;
        const faces: number[][] = [];
        for (let fi = 0; fi < pidx.count / 3; fi++) {
          faces.push([pidx.getX(fi * 3), pidx.getX(fi * 3 + 1), pidx.getX(fi * 3 + 2)]);
        }

        items.push({
          panelId: panel.id,
          label: panel.label,
          color: panel.color,
          x: rect.x,
          y: rect.y,
          width: cand.w,
          height: cand.h,
          rotation: cand.rotation,
          grainAngle,
          flat2d: panel.flatResult!.flat2d,
          faces,
          distortion: panel.flatResult!.distortion,
          boundingBox: bbox,
          scale: mmScale,
        });

        // Split free rects
        freeRects = splitRect(rect, cand.w, cand.h, freeRects.filter((_, i) => i !== index));
        placed = true;
        break;
      }
    }

    if (!placed) unplaced.push(panel.id);
  }

  const usedArea = items.reduce((s, item) => s + item.width * item.height, 0);
  const totalArea = width * height;

  return {
    items,
    sheetWidth: width,
    sheetHeight: height,
    usedArea,
    totalArea,
    efficiency: usedArea / totalArea,
    unplaced,
  };
}

// ── Standard fabric sheet sizes ───────────────────────────────────────────────
export const SHEET_PRESETS = [
  { label: 'Standard (1400 × 2000mm)', width: 1400, height: 2000 },
  { label: 'Wide (1800 × 2000mm)',      width: 1800, height: 2000 },
  { label: 'Narrow (1200 × 2000mm)',    width: 1200, height: 2000 },
  { label: 'Marine Roll (1500 × 3000mm)', width: 1500, height: 3000 },
  { label: 'Automotive (1600 × 2500mm)', width: 1600, height: 2500 },
  { label: 'A0 Paper (841 × 1189mm)',   width: 841,  height: 1189 },
  { label: 'Custom',                    width: 0,    height: 0 },
];
