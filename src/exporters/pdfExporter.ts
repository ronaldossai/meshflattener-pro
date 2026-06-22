import { Panel } from './panelSplitter';
import { NestingResult, NestedItem } from './nestingOptimizer';

// ── PDF builder (hand-crafted PDF syntax, no external lib needed) ─────────────
// We build a valid PDF 1.4 with embedded vector paths.

interface PDFPage {
  width: number;   // points (1pt = 1/72 inch = 0.3528mm)
  height: number;
  content: string;
}

const MM_TO_PT = 2.8346;
const A1_W = 594;  // A1 in points
const A1_H = 841;

function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// ── Draw a single panel page ──────────────────────────────────────────────────
function buildPanelPage(panel: Panel, seamAllowance: number): PDFPage {
  if (!panel.flatResult || !panel.boundingBox2d) {
    return { width: A1_W, height: A1_H, content: '' };
  }

  const { flat2d, distortion } = panel.flatResult;
  const { minX, maxX, minY, maxY } = panel.boundingBox2d;
  const rawW = maxX - minX, rawH = maxY - minY;

  // Page size: panel + margins (50mm each side) + seam allowance
  const pageWmm = rawW + (seamAllowance + 50) * 2;
  const pageHmm = rawH + (seamAllowance + 50) * 2;
  const pageW = mmToPt(pageWmm);
  const pageH = mmToPt(pageHmm);

  // Scale: 1:1 (1 model unit = 1 mm for typical upholstery)
  // If too large for A1, scale down
  const maxDim = Math.max(pageW, pageH);
  const scaleToFit = maxDim > 2800 ? 2800 / maxDim : 1;
  const scale = MM_TO_PT * scaleToFit;

  const marginPt = mmToPt(50 + seamAllowance);
  const originX = marginPt;
  const originY = pageH - marginPt; // PDF Y is from bottom

  const lines: string[] = [];

  // Header
  lines.push('BT');
  lines.push('/F1 12 Tf');
  lines.push(`${mmToPt(10)} ${pageH - mmToPt(12)} Td`);
  lines.push(`(${escapeStr(panel.label)} — MeshFlattener Pro) Tj`);
  lines.push('ET');

  // Sub-header info
  lines.push('BT');
  lines.push('/F1 8 Tf');
  lines.push(`${mmToPt(10)} ${pageH - mmToPt(20)} Td`);
  lines.push(`(Faces: ${panel.faceCount}  |  Area: ${panel.area3d.toFixed(1)} u\xb2  |  Seam: ${seamAllowance}mm) Tj`);
  lines.push('ET');

  // Build face index list
  const pidx = panel.geometry.index!;
  const faces: [number, number, number][] = [];
  for (let fi = 0; fi < pidx.count / 3; fi++) {
    faces.push([pidx.getX(fi*3), pidx.getX(fi*3+1), pidx.getX(fi*3+2)]);
  }

  const toX = (u: number) => originX + (u - minX) * scale;
  const toY = (v: number) => originY - (v - minY) * scale;

  // Draw mesh triangles (light fill)
  lines.push('0.85 0.88 0.92 rg'); // light blue-grey fill
  lines.push('0.5 0.55 0.62 RG');  // stroke
  lines.push('0.3 w');

  for (const [a, b, c] of faces) {
    const ax = toX(flat2d[a][0]), ay = toY(flat2d[a][1]);
    const bx = toX(flat2d[b][0]), by = toY(flat2d[b][1]);
    const cx = toX(flat2d[c][0]), cy = toY(flat2d[c][1]);
    lines.push(`${ax.toFixed(2)} ${ay.toFixed(2)} m`);
    lines.push(`${bx.toFixed(2)} ${by.toFixed(2)} l`);
    lines.push(`${cx.toFixed(2)} ${cy.toFixed(2)} l`);
    lines.push('b');
  }

  // Seam allowance outline (dashed green)
  const saX1 = toX(minX - seamAllowance);
  const saY1 = toY(minY - seamAllowance);
  const saW = (rawW + seamAllowance * 2) * scale;
  const saH = (rawH + seamAllowance * 2) * scale;
  lines.push('0.3 0.8 0.4 RG');  // green
  lines.push('n'); // no fill
  lines.push('[4 3] 0 d');        // dashed
  lines.push('1.5 w');
  lines.push(`${saX1.toFixed(2)} ${saY1.toFixed(2)} ${saW.toFixed(2)} ${saH.toFixed(2)} re S`);
  lines.push('[] 0 d');           // reset dash

  // Cut line (solid red outer boundary)
  const cutMargin = seamAllowance * 1.5;
  const cX1 = toX(minX - cutMargin);
  const cY1 = toY(minY - cutMargin);
  const cW = (rawW + cutMargin * 2) * scale;
  const cH = (rawH + cutMargin * 2) * scale;
  lines.push('0.9 0.2 0.2 RG');
  lines.push('0.8 w');
  lines.push(`${cX1.toFixed(2)} ${cY1.toFixed(2)} ${cW.toFixed(2)} ${cH.toFixed(2)} re S`);

  // Scale bar (50mm reference)
  const sbX = mmToPt(10);
  const sbY = mmToPt(30);
  const sbLen = mmToPt(50) * scaleToFit;
  lines.push('0 0 0 RG');
  lines.push('0 0 0 rg');
  lines.push('1 w');
  lines.push(`${sbX} ${sbY} m ${sbX + sbLen} ${sbY} l S`);
  lines.push(`${sbX} ${sbY - 3} m ${sbX} ${sbY + 3} l S`);
  lines.push(`${sbX + sbLen} ${sbY - 3} m ${sbX + sbLen} ${sbY + 3} l S`);
  lines.push('BT /F1 7 Tf');
  lines.push(`${sbX + sbLen / 2 - 10} ${sbY - 10} Td`);
  lines.push(`(50mm) Tj ET`);

  // Grain direction arrow (horizontal = 0°)
  const gcx = toX((minX + maxX) / 2);
  const gcy = toY((minY + maxY) / 2);
  const arrowLen = Math.min(rawW, rawH) * scale * 0.2;
  lines.push('0.9 0.78 0.2 RG');
  lines.push('0.9 0.78 0.2 rg');
  lines.push('[4 2] 0 d');
  lines.push('1 w');
  lines.push(`${(gcx - arrowLen).toFixed(2)} ${gcy.toFixed(2)} m ${(gcx + arrowLen).toFixed(2)} ${gcy.toFixed(2)} l S`);
  lines.push('[] 0 d');
  // Arrowhead
  lines.push(`${(gcx + arrowLen).toFixed(2)} ${gcy.toFixed(2)} m ${(gcx + arrowLen - 8).toFixed(2)} ${(gcy - 4).toFixed(2)} l ${(gcx + arrowLen - 8).toFixed(2)} ${(gcy + 4).toFixed(2)} l f`);
  lines.push('BT /F1 7 Tf');
  lines.push(`${(gcx - 12).toFixed(2)} ${(gcy + arrowLen * 0.4).toFixed(2)} Td`);
  lines.push('(GRAIN) Tj ET');

  // Panel label (large, centered)
  lines.push('BT');
  lines.push('/F1 18 Tf');
  lines.push(`0.3 0.3 0.3 rg`);
  lines.push(`${(toX((minX + maxX) / 2) - 20).toFixed(2)} ${(toY((minY + maxY) / 2) + 10).toFixed(2)} Td`);
  lines.push(`(${escapeStr(panel.label)}) Tj`);
  lines.push('ET');

  // Legend
  lines.push('BT /F1 7 Tf 0.4 0.5 0.6 rg');
  lines.push(`${mmToPt(10)} ${mmToPt(22)} Td`);
  lines.push('(--- Seam allowance) Tj ET');
  lines.push('BT /F1 7 Tf 0.9 0.2 0.2 rg');
  lines.push(`${mmToPt(10)} ${mmToPt(16)} Td`);
  lines.push('(--- Cut line) Tj ET');

  return { width: pageW, height: pageH, content: lines.join('\n') };
}

// ── Build nesting sheet page ──────────────────────────────────────────────────
function buildNestingPage(nestResult: NestingResult, seamAllowance: number): PDFPage {
  const { sheetWidth, sheetHeight, items, efficiency, unplaced } = nestResult;

  // Scale to A1
  const scaleX = A1_W / mmToPt(sheetWidth);
  const scaleY = A1_H / mmToPt(sheetHeight);
  const scale = Math.min(scaleX, scaleY) * MM_TO_PT;
  const ox = (A1_W - sheetWidth * scale) / 2;
  const oy = A1_H - (A1_H - sheetHeight * scale) / 2;

  const lines: string[] = [];

  // Title
  lines.push('BT /F1 11 Tf 0 0 0 rg');
  lines.push(`${mmToPt(5)} ${A1_H - mmToPt(8)} Td`);
  lines.push(`(MeshFlattener Pro — Nesting Layout  |  ${sheetWidth}×${sheetHeight}mm  |  Efficiency: ${(efficiency*100).toFixed(1)}%) Tj`);
  lines.push('ET');

  // Sheet boundary
  lines.push('0.3 0.3 0.3 RG 0.95 0.95 0.9 rg 1 w');
  lines.push(`${ox.toFixed(2)} ${(oy - sheetHeight * scale).toFixed(2)} ${(sheetWidth * scale).toFixed(2)} ${(sheetHeight * scale).toFixed(2)} re B`);

  // Grid lines every 100mm
  lines.push('0.85 0.85 0.85 RG 0.3 w');
  for (let x = 0; x <= sheetWidth; x += 100) {
    const px = ox + x * scale;
    lines.push(`${px.toFixed(2)} ${(oy - sheetHeight * scale).toFixed(2)} m ${px.toFixed(2)} ${oy.toFixed(2)} l S`);
  }
  for (let y = 0; y <= sheetHeight; y += 100) {
    const py = oy - y * scale;
    lines.push(`${ox.toFixed(2)} ${py.toFixed(2)} m ${(ox + sheetWidth * scale).toFixed(2)} ${py.toFixed(2)} l S`);
  }

  // Draw panels
  for (const item of items) {
    const hex = item.color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const px = ox + item.x * scale;
    const py = oy - item.y * scale;
    const pw = item.width * scale;
    const ph = item.height * scale;

    // Panel fill
    lines.push(`${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg`);
    lines.push(`${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG`);
    lines.push('0.5 w');
    lines.push(`${px.toFixed(2)} ${(py - ph).toFixed(2)} ${pw.toFixed(2)} ${ph.toFixed(2)} re B`);

    // Seam allowance inner dashed
    const sa = seamAllowance * scale * 0.7;
    lines.push('0.2 0.6 0.3 RG n [2 1.5] 0 d 0.5 w');
    lines.push(`${(px+sa).toFixed(2)} ${(py-ph+sa).toFixed(2)} ${(pw-sa*2).toFixed(2)} ${(ph-sa*2).toFixed(2)} re S`);
    lines.push('[] 0 d');

    // Label
    lines.push(`BT /F1 ${Math.max(5, Math.min(9, pw/7)).toFixed(0)} Tf 1 1 1 rg`);
    lines.push(`${(px + 3).toFixed(2)} ${(py - 10).toFixed(2)} Td`);
    lines.push(`(${escapeStr(item.label)}) Tj ET`);

    // Grain arrow
    const gcx = px + pw / 2;
    const gcy = py - ph / 2;
    const arrowLen = Math.min(pw, ph) * 0.22;
    const angle = (item.grainAngle + (item.rotation === 90 ? 90 : 0)) * Math.PI / 180;
    const ax = Math.cos(angle) * arrowLen;
    const ay = Math.sin(angle) * arrowLen;
    lines.push('0.95 0.85 0.2 RG [2 1.5] 0 d 0.8 w');
    lines.push(`${(gcx - ax).toFixed(2)} ${(gcy + ay).toFixed(2)} m ${(gcx + ax).toFixed(2)} ${(gcy - ay).toFixed(2)} l S`);
    lines.push('[] 0 d');
  }

  // Ruler labels x
  lines.push('BT /F1 6 Tf 0.3 0.3 0.3 rg');
  for (let x = 0; x <= sheetWidth; x += 200) {
    lines.push(`${(ox + x * scale - 5).toFixed(2)} ${(oy - sheetHeight * scale - 10).toFixed(2)} Td`);
    lines.push(`(${x}) Tj`);
    lines.push(`${(-(ox + x * scale - 5)).toFixed(2)} ${(-(oy - sheetHeight * scale - 10)).toFixed(2)} Td`);
  }
  lines.push('ET');

  // Efficiency bar
  const barX = A1_W - 120, barY = A1_H - 25;
  lines.push('0.2 0.2 0.2 rg 0.4 0.4 0.4 RG 0.5 w');
  lines.push(`${barX} ${barY} 100 8 re B`);
  const ec = efficiency > 0.75 ? '0.3 0.8 0.4' : efficiency > 0.5 ? '0.9 0.78 0.2' : '0.9 0.2 0.2';
  lines.push(`${ec} rg`);
  lines.push(`${barX} ${barY} ${(100 * efficiency).toFixed(1)} 8 re f`);
  lines.push(`BT /F1 7 Tf 0 0 0 rg ${barX} ${(barY - 8).toFixed(2)} Td (Efficiency: ${(efficiency*100).toFixed(1)}%) Tj ET`);

  return { width: A1_W, height: A1_H, content: lines.join('\n') };
}

// ── Assemble full PDF ─────────────────────────────────────────────────────────
export function generatePDF(
  panels: Panel[],
  seamAllowance: number,
  nestResult?: NestingResult
): string {
  const pages: PDFPage[] = [];

  // One page per panel
  for (const panel of panels) {
    if (panel.flatResult) pages.push(buildPanelPage(panel, seamAllowance));
  }

  // Nesting sheet page (if available)
  if (nestResult) {
    pages.push(buildNestingPage(nestResult, seamAllowance));
  }

  if (pages.length === 0) return '';

  // Build PDF structure
  const objs: string[] = [];
  let objCounter = 1;

  const addObj = (content: string): number => {
    const id = objCounter++;
    objs.push(`${id} 0 obj\n${content}\nendobj`);
    return id;
  };

  // Font object
  const fontId = addObj(`<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Courier
  /Encoding /WinAnsiEncoding
>>`);

  // Page content and page objects
  const pageIds: number[] = [];
  for (const page of pages) {
    const streamContent = page.content;
    const streamId = addObj(`<<
  /Length ${streamContent.length}
>>
stream
${streamContent}
endstream`);

    const pageId = addObj(`<<
  /Type /Page
  /MediaBox [0 0 ${page.width.toFixed(2)} ${page.height.toFixed(2)}]
  /Contents ${streamId} 0 R
  /Resources <<
    /Font << /F1 ${fontId} 0 R >>
    /ProcSet [/PDF /Text]
  >>
>>`);
    pageIds.push(pageId);
  }

  // Pages catalog
  const pagesId = addObj(`<<
  /Type /Pages
  /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}]
  /Count ${pageIds.length}
>>`);

  const catalogId = addObj(`<<
  /Type /Catalog
  /Pages ${pagesId} 0 R
>>`);

  // Build xref table
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [0];

  for (const obj of objs) {
    offsets.push(pdf.length);
    pdf += obj + '\n';
  }

  const xrefOffset = pdf.length;
  pdf += 'xref\n';
  pdf += `0 ${objs.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += offsets[i].toString().padStart(10, '0') + ' 00000 n \n';
  }

  pdf += 'trailer\n';
  pdf += `<<\n  /Size ${objs.length + 1}\n  /Root ${catalogId} 0 R\n>>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return pdf;
}

// ── Trigger browser download ──────────────────────────────────────────────────
export function downloadPDF(pdfContent: string, filename: string = 'patterns.pdf') {
  // Encode as Latin-1 binary
  const bytes = new Uint8Array(pdfContent.length);
  for (let i = 0; i < pdfContent.length; i++) {
    bytes[i] = pdfContent.charCodeAt(i) & 0xff;
  }
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
