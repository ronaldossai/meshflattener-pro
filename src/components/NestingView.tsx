import { useEffect, useRef, useCallback } from 'react';
import { NestingResult, NestedItem } from '../geometry/nestingOptimizer';

interface NestingViewProps {
  result: NestingResult;
  showGrain?: boolean;
  showDistortion?: boolean;
}

export default function NestingView({ result, showGrain = true, showDistortion = false }: NestingViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#0e0f11';
    ctx.fillRect(0, 0, W, H);

    const MARGIN = 40;
    // Scale sheet to canvas
    const scaleX = (W - MARGIN * 2) / result.sheetWidth;
    const scaleY = (H - MARGIN * 2) / result.sheetHeight;
    const scale = Math.min(scaleX, scaleY);
    const ox = (W - result.sheetWidth * scale) / 2;
    const oy = (H - result.sheetHeight * scale) / 2;

    // Sheet background
    ctx.fillStyle = '#16181c';
    ctx.strokeStyle = '#e8c84a';
    ctx.lineWidth = 1.5;
    ctx.fillRect(ox, oy, result.sheetWidth * scale, result.sheetHeight * scale);
    ctx.strokeRect(ox, oy, result.sheetWidth * scale, result.sheetHeight * scale);

    // Sheet label
    ctx.fillStyle = '#6b7080';
    ctx.font = '10px "Courier New"';
    ctx.fillText(`${result.sheetWidth} × ${result.sheetHeight} mm`, ox + 6, oy + 14);

    // Grid lines (every 100mm)
    ctx.strokeStyle = 'rgba(42,45,53,0.8)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= result.sheetWidth; x += 100) {
      ctx.beginPath();
      ctx.moveTo(ox + x * scale, oy);
      ctx.lineTo(ox + x * scale, oy + result.sheetHeight * scale);
      ctx.stroke();
    }
    for (let y = 0; y <= result.sheetHeight; y += 100) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + y * scale);
      ctx.lineTo(ox + result.sheetWidth * scale, oy + y * scale);
      ctx.stroke();
    }

    // Draw each placed item
    for (const item of result.items) {
      drawPanel(ctx, item, ox, oy, scale, showGrain, showDistortion);
    }

    // Efficiency meter (top right)
    const eff = result.efficiency;
    const barW = 140, barH = 10;
    const bx = W - barW - MARGIN, by = MARGIN - 20;
    ctx.fillStyle = '#16181c';
    ctx.strokeStyle = '#2a2d35';
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, barW, barH);
    ctx.strokeRect(bx, by, barW, barH);
    const effColor = eff > 0.75 ? '#4ecb71' : eff > 0.5 ? '#e8c84a' : '#e84a4a';
    ctx.fillStyle = effColor;
    ctx.fillRect(bx, by, barW * eff, barH);
    ctx.fillStyle = '#e2e4ea';
    ctx.font = 'bold 10px "Courier New"';
    ctx.fillText(`${(eff * 100).toFixed(1)}% efficiency`, bx, by - 4);

    // Unplaced warning
    if (result.unplaced.length > 0) {
      ctx.fillStyle = '#e84a4a';
      ctx.font = '10px "Courier New"';
      ctx.fillText(`⚠ ${result.unplaced.length} panel(s) did not fit`, ox + 6, oy + result.sheetHeight * scale - 8);
    }

    // Ruler marks (x axis)
    ctx.fillStyle = '#6b7080';
    ctx.font = '8px "Courier New"';
    for (let x = 0; x <= result.sheetWidth; x += 200) {
      ctx.fillText(`${x}`, ox + x * scale, oy + result.sheetHeight * scale + 12);
    }
    // y axis
    for (let y = 0; y <= result.sheetHeight; y += 200) {
      ctx.save();
      ctx.translate(ox - 4, oy + y * scale);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${y}`, 0, 0);
      ctx.restore();
    }

  }, [result, showGrain, showDistortion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      draw();
    });
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <canvas ref={canvasRef} width={900} height={700}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
  );
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  item: NestedItem,
  ox: number, oy: number,
  sheetScale: number,
  showGrain: boolean,
  showDistortion: boolean
) {
  const px = ox + item.x * sheetScale;
  const py = oy + item.y * sheetScale;
  const pw = item.width * sheetScale;
  const ph = item.height * sheetScale;

  ctx.save();
  ctx.translate(px, py);

  // Panel background tint
  const hex = item.color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  // Clip to panel bounding box
  ctx.beginPath();
  ctx.rect(0, 0, pw, ph);
  ctx.clip();

  // Fill triangles
  const { flat2d, faces, distortion, boundingBox, scale: panelScale } = item;
  const { minX, minY, maxX, maxY } = boundingBox;
  const rawW = maxX - minX, rawH = maxY - minY;
  const triScaleX = pw / (rawW + 0);
  const triScaleY = ph / (rawH + 0);
  const tScale = Math.min(triScaleX, triScaleY);
  const tox = (pw - rawW * tScale) / 2;
  const toy = (ph - rawH * tScale) / 2;

  // Rotation transform for 90° rotated panels
  if (item.rotation === 90) {
    ctx.translate(pw, 0);
    ctx.rotate(Math.PI / 2);
  }

  faces.forEach(([a, b, c], fi) => {
    let fr: number, fg: number, fb: number;
    if (showDistortion) {
      const d = Math.max(0, Math.min(2, distortion[fi] ?? 1));
      if (d <= 1) { fr = Math.floor(78 * d); fg = 203; fb = Math.floor(113 * (1 - d / 2)); }
      else { fr = 232; fg = Math.floor(203 - 140 * (d - 1)); fb = 58; }
    } else {
      fr = r; fg = g; fb = b;
    }
    const toScreen = (idx: number): [number, number] => {
      const pt = flat2d[idx] || [0, 0];
      return [tox + (pt[0] - minX) * tScale, toy + (pt[1] - minY) * tScale];
    };
    const [p0, p1, p2] = [a, b, c].map(toScreen);
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    ctx.fillStyle = `rgba(${fr},${fg},${fb},0.55)`;
    ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.15)`;
    ctx.lineWidth = 0.3;
    ctx.fill(); ctx.stroke();
  });

  ctx.restore();
  ctx.save();
  ctx.translate(px, py);

  // Outline box
  ctx.strokeStyle = item.color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.strokeRect(1, 1, pw - 2, ph - 2);

  // Seam allowance dashed inner
  const sa = 4;
  ctx.strokeStyle = `${item.color}80`;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(sa, sa, pw - sa * 2, ph - sa * 2);
  ctx.setLineDash([]);

  // Label
  ctx.fillStyle = item.color;
  ctx.font = `bold ${Math.max(8, Math.min(13, pw / 8))}px "Courier New"`;
  ctx.fillText(item.label, 6, 14);

  // Dimensions text
  if (pw > 60 && ph > 30) {
    ctx.fillStyle = 'rgba(107,112,128,0.8)';
    ctx.font = `${Math.max(7, Math.min(9, pw / 12))}px "Courier New"`;
    ctx.fillText(`${item.width.toFixed(0)}×${item.height.toFixed(0)}mm`, 6, ph - 5);
  }

  // Grain direction arrow
  if (showGrain && pw > 40 && ph > 40) {
    const cx = pw / 2, cy = ph / 2;
    const arrowLen = Math.min(pw, ph) * 0.3;
    const angle = ((item.grainAngle + (item.rotation === 90 ? 90 : 0)) * Math.PI) / 180;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.strokeStyle = 'rgba(232,200,74,0.8)';
    ctx.fillStyle = 'rgba(232,200,74,0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);

    // Arrow shaft
    ctx.beginPath();
    ctx.moveTo(-arrowLen, 0);
    ctx.lineTo(arrowLen, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowheads both ends
    for (const dir of [-1, 1]) {
      const tipX = dir * arrowLen;
      ctx.beginPath();
      ctx.moveTo(tipX, 0);
      ctx.lineTo(tipX - dir * 6, -3);
      ctx.lineTo(tipX - dir * 6, 3);
      ctx.closePath();
      ctx.fill();
    }

    // Grain label
    ctx.fillStyle = 'rgba(232,200,74,0.6)';
    ctx.font = '7px "Courier New"';
    ctx.textAlign = 'center';
    ctx.fillText('GRAIN', 0, -arrowLen * 0.5 - 3);
    ctx.textAlign = 'left';

    ctx.restore();
  }

  ctx.restore();
}
