import { useEffect, useRef, useCallback } from 'react';
import { Panel, arrangePanels } from '../geometry/panelSplitter';
import { usePanelStore } from '../store/usePanelStore';

interface MultiPanelViewProps {
  panels: Panel[];
  seamAllowance: number;
  mode: 'flat' | 'distortion';
}

export default function MultiPanelView({ panels, seamAllowance, mode }: MultiPanelViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { selectedPanelId, selectPanel } = usePanelStore();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !panels.length) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#0e0f11';
    ctx.fillRect(0, 0, W, H);

    // Layout arrangement
    const PADDING = 24;
    const SA = seamAllowance;

    // Compute global scale: fit all panels in canvas
    const totalItems = panels.filter(p => p.boundingBox2d && p.flatResult);
    if (!totalItems.length) return;

    // Determine layout
    const cols = Math.ceil(Math.sqrt(totalItems.length));
    const rows = Math.ceil(totalItems.length / cols);
    const cellW = (W - PADDING * (cols + 1)) / cols;
    const cellH = (H - PADDING * (rows + 1)) / rows;

    totalItems.forEach((panel, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = PADDING + col * (cellW + PADDING);
      const cellY = PADDING + row * (cellH + PADDING);

      const { flat2d, distortion } = panel.flatResult!;
      const { minX, maxX, minY, maxY } = panel.boundingBox2d!;
      const pw = maxX - minX || 1, ph = maxY - minY || 1;

      // Scale to fit cell with margin
      const margin = 28;
      const scale = Math.min((cellW - margin * 2) / pw, (cellH - margin * 2) / ph);
      const ox = cellX + (cellW - pw * scale) / 2;
      const oy = cellY + (cellH - ph * scale) / 2;

      const toS = (p: [number, number]): [number, number] => [
        ox + (p[0] - minX) * scale,
        oy + (p[1] - minY) * scale,
      ];

      // Build face list
      const pgeo = panel.geometry;
      const pidx = pgeo.index!;
      const faces: [number, number, number][] = [];
      for (let fi = 0; fi < pidx.count / 3; fi++) {
        faces.push([pidx.getX(fi*3), pidx.getX(fi*3+1), pidx.getX(fi*3+2)]);
      }

      const isSelected = panel.id === selectedPanelId;

      // Cell background
      ctx.fillStyle = isSelected ? 'rgba(232,200,74,0.04)' : 'rgba(22,24,28,0.8)';
      ctx.strokeStyle = isSelected ? panel.color : '#2a2d35';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(cellX, cellY, cellW, cellH, 4);
      ctx.fill(); ctx.stroke();

      // Draw triangles
      faces.forEach(([a, b, c], fi) => {
        let r: number, g: number, bl: number;
        if (mode === 'distortion') {
          const d = Math.max(0, Math.min(2, distortion[fi] ?? 1));
          if (d <= 1) { r = Math.floor(78 * d); g = 203; bl = Math.floor(113 * (1 - d / 2)); }
          else { r = 232; g = Math.floor(203 - 140 * (d - 1)); bl = 58; }
        } else {
          // Panel color tinted
          const hex = panel.color.replace('#', '');
          r = parseInt(hex.slice(0, 2), 16);
          g = parseInt(hex.slice(2, 4), 16);
          bl = parseInt(hex.slice(4, 6), 16);
        }
        const [p0, p1, p2] = [a, b, c].map(j => toS(flat2d[j]));
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
        ctx.closePath();
        ctx.fillStyle = `rgba(${r},${g},${bl},${mode === 'distortion' ? 0.65 : 0.35})`;
        ctx.strokeStyle = `rgba(${r},${g},${bl},0.2)`;
        ctx.lineWidth = 0.4;
        ctx.fill(); ctx.stroke();
      });

      // Panel outline
      const sa = SA * scale * 0.05;
      ctx.strokeStyle = panel.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(ox - sa, oy - sa, pw * scale + sa * 2, ph * scale + sa * 2);
      ctx.setLineDash([]);

      // Panel label
      ctx.font = `bold 11px "Courier New"`;
      ctx.fillStyle = panel.color;
      ctx.fillText(panel.label, cellX + 8, cellY + 16);

      // Stats
      ctx.font = `9px "Courier New"`;
      ctx.fillStyle = '#6b7080';
      ctx.fillText(`${panel.faceCount} faces`, cellX + 8, cellY + cellH - 16);
      ctx.fillText(`${panel.area3d.toFixed(1)} u²`, cellX + 8, cellY + cellH - 6);

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = panel.color;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.strokeRect(cellX + 1, cellY + 1, cellW - 2, cellH - 2);
      }
    });

    // Legend (distortion mode)
    if (mode === 'distortion') {
      const lx = W - 90, ly = H - 110;
      const grad = ctx.createLinearGradient(lx, ly, lx, ly + 80);
      grad.addColorStop(0, 'rgb(232,74,74)');
      grad.addColorStop(0.5, 'rgb(78,203,113)');
      grad.addColorStop(1, 'rgb(78,130,203)');
      ctx.fillStyle = grad; ctx.fillRect(lx, ly, 16, 80);
      ctx.strokeStyle = '#2a2d35'; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.strokeRect(lx, ly, 16, 80);
      ctx.fillStyle = '#6b7080'; ctx.font = '9px "Courier New"';
      ctx.fillText('Stretch', lx + 20, ly + 10);
      ctx.fillText('None', lx + 20, ly + 44);
      ctx.fillText('Compress', lx + 20, ly + 80);
    }
  }, [panels, seamAllowance, mode, selectedPanelId]);

  // Resize observer
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

  // Click to select panel
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    const totalItems = panels.filter(p => p.boundingBox2d && p.flatResult);
    const cols = Math.ceil(Math.sqrt(totalItems.length));
    const rows = Math.ceil(totalItems.length / cols);
    const PADDING = 24;
    const cellW = (canvas.width - PADDING * (cols + 1)) / cols;
    const cellH = (canvas.height - PADDING * (rows + 1)) / rows;

    for (let i = 0; i < totalItems.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = PADDING + col * (cellW + PADDING);
      const cellY = PADDING + row * (cellH + PADDING);
      if (mx >= cellX && mx <= cellX + cellW && my >= cellY && my <= cellY + cellH) {
        selectPanel(totalItems[i].id === selectedPanelId ? null : totalItems[i].id);
        return;
      }
    }
    selectPanel(null);
  }, [panels, selectedPanelId, selectPanel]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      onClick={handleClick}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
    />
  );
}
