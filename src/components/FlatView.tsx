import { useEffect, useRef } from 'react';

interface FlatViewProps {
  flat2d: [number, number][];
  faces: number[][];
  distortion: number[];
  seamAllowance: number;
  mode: 'flat' | 'distortion';
}

export default function FlatView({ flat2d, faces, distortion, seamAllowance, mode }: FlatViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !flat2d.length) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#0e0f11';
    ctx.fillRect(0, 0, W, H);

    const xs = flat2d.map(p=>p[0]), ys = flat2d.map(p=>p[1]);
    const minX=Math.min(...xs), maxX=Math.max(...xs);
    const minY=Math.min(...ys), maxY=Math.max(...ys);
    const sw=maxX-minX||1, sh=maxY-minY||1;
    const margin=52;
    const scale=Math.min((W-margin*2)/sw,(H-margin*2)/sh);
    const ox=(W-sw*scale)/2, oy=(H-sh*scale)/2;
    const toScreen = (p: [number,number]): [number,number] => [ox+(p[0]-minX)*scale, oy+(p[1]-minY)*scale];

    // Draw faces
    faces.forEach(([a,b,c], i) => {
      const d = Math.max(0, Math.min(2, distortion[i] ?? 1));
      let r: number, g: number, bl: number;
      if (mode === 'distortion') {
        if (d <= 1) { r=Math.floor(78*d); g=203; bl=Math.floor(113*(1-d/2)); }
        else { r=232; g=Math.floor(203-140*(d-1)); bl=58; }
      } else {
        r=74; g=130; bl=180;
      }
      const [p0,p1,p2] = [a,b,c].map(j=>toScreen(flat2d[j]));
      ctx.beginPath();
      ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.closePath();
      ctx.fillStyle = `rgba(${r},${g},${bl},${mode==='distortion'?0.7:0.4})`;
      ctx.strokeStyle = 'rgba(232,200,74,0.15)';
      ctx.lineWidth = 0.5;
      ctx.fill(); ctx.stroke();
    });

    // Seam allowance
    if (seamAllowance > 0) {
      const sa = seamAllowance * scale * 0.06;
      ctx.strokeStyle = '#4ecb71';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(ox-sa, oy-sa, sw*scale+sa*2, sh*scale+sa*2);
      ctx.setLineDash([]);
      ctx.fillStyle = '#4ecb71';
      ctx.font = '11px "Courier New"';
      ctx.fillText(`+ ${seamAllowance}mm`, ox-sa, oy-sa-8);
    }

    // Distortion legend
    if (mode === 'distortion') {
      const lx=W-100, ly=H-120;
      const grad = ctx.createLinearGradient(lx,ly,lx,ly+90);
      grad.addColorStop(0,'rgb(232,74,74)');
      grad.addColorStop(0.5,'rgb(78,203,113)');
      grad.addColorStop(1,'rgb(78,130,203)');
      ctx.fillStyle=grad; ctx.fillRect(lx,ly,18,90);
      ctx.strokeStyle='#2a2d35'; ctx.lineWidth=1; ctx.strokeRect(lx,ly,18,90);
      ctx.fillStyle='#6b7080'; ctx.font='10px "Courier New"';
      ctx.fillText('Stretch',lx+22,ly+10);
      ctx.fillText('None',lx+22,ly+48);
      ctx.fillText('Compress',lx+22,ly+90);
    }

    // Grain direction arrow
    const arrowX=ox+sw*scale/2, arrowY=oy-24;
    ctx.strokeStyle='rgba(232,200,74,0.6)'; ctx.lineWidth=1.5;
    ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(arrowX-30,arrowY); ctx.lineTo(arrowX+30,arrowY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(arrowX+30,arrowY); ctx.lineTo(arrowX+24,arrowY-4); ctx.lineTo(arrowX+24,arrowY+4); ctx.closePath();
    ctx.fillStyle='rgba(232,200,74,0.6)'; ctx.fill();
    ctx.fillStyle='rgba(232,200,74,0.5)'; ctx.font='9px "Courier New"';
    ctx.textAlign='center'; ctx.fillText('GRAIN',arrowX,arrowY-8); ctx.textAlign='left';

  }, [flat2d, faces, distortion, seamAllowance, mode]);

  // Responsive resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      // trigger redraw by updating a dep — we just re-render
    });
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}
