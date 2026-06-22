export function exportSVG(
  flat2d: [number, number][],
  faces: number[][],
  distortion: number[],
  seamAllowance: number,
  fileName: string
): string {
  const W = 800, H = 600;
  const xs = flat2d.map(p=>p[0]), ys = flat2d.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const sw=maxX-minX||1, sh=maxY-minY||1;
  const margin=48;
  const scale=Math.min((W-margin*2)/sw,(H-margin*2)/sh);
  const ox=(W-sw*scale)/2, oy=(H-sh*scale)/2;

  const distColors = faces.map((_,i)=>{
    const d=Math.max(0,Math.min(2,distortion[i]||1));
    if(d<=1) return `rgb(${Math.floor(78*d)},203,${Math.floor(113*(1-d/2))})`;
    return `rgb(232,${Math.floor(203-140*(d-1))},58)`;
  });

  const tris = faces.map(([a,b,c],i)=>{
    const pts=[a,b,c].map(j=>`${ox+(flat2d[j][0]-minX)*scale},${oy+(flat2d[j][1]-minY)*scale}`).join(' ');
    return `<polygon points="${pts}" fill="${distColors[i]}" fill-opacity="0.5" stroke="#e8c84a" stroke-width="0.4"/>`;
  }).join('\n  ');

  const sa = seamAllowance*scale*0.08;
  const outline = `<rect x="${ox-sa}" y="${oy-sa}" width="${sw*scale+sa*2}" height="${sh*scale+sa*2}"
    fill="none" stroke="#4ecb71" stroke-width="2" stroke-dasharray="8,4"/>`;
  const saLabel = `<text x="${ox-sa}" y="${oy-sa-8}" fill="#4ecb71" font-size="10" font-family="'Courier New'">+ ${seamAllowance}mm seam allowance</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#0e0f11"/>
  ${tris}
  ${outline}
  ${saLabel}
  <text x="10" y="18" fill="#6b7080" font-size="10" font-family="'Courier New'">${fileName} — MeshFlattener Pro</text>
  <text x="10" y="${H-8}" fill="#6b7080" font-size="9" font-family="'Courier New'">Faces: ${faces.length} | Seam: ${seamAllowance}mm</text>
</svg>`;
}

export function exportDXF(
  flat2d: [number, number][],
  faces: number[][],
  seamAllowance: number
): string {
  const xs=flat2d.map(p=>p[0]), ys=flat2d.map(p=>p[1]);
  const minX=Math.min(...xs), minY=Math.min(...ys);
  const SCALE = 100; // convert to mm-ish units

  let entities = '';
  const seen = new Set<string>();

  for (const [a,b,c] of faces) {
    for (const [i,j] of [[a,b],[b,c],[c,a]]) {
      const key = [i,j].sort().join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      const x1=(flat2d[i][0]-minX)*SCALE, y1=(flat2d[i][1]-minY)*SCALE;
      const x2=(flat2d[j][0]-minX)*SCALE, y2=(flat2d[j][1]-minY)*SCALE;
      entities += `0\nLINE\n8\nMESH\n10\n${x1.toFixed(4)}\n20\n${y1.toFixed(4)}\n30\n0\n11\n${x2.toFixed(4)}\n21\n${y2.toFixed(4)}\n31\n0\n`;
    }
  }

  // Seam allowance rectangle
  const maxX=(Math.max(...xs)-minX)*SCALE, maxY=(Math.max(...ys)-minY)*SCALE;
  const sa = seamAllowance;
  const corners = [[-sa,-sa],[maxX+sa,-sa],[maxX+sa,maxY+sa],[-sa,maxY+sa],[-sa,-sa]];
  for(let k=0;k<4;k++){
    const [x1,y1]=corners[k],[x2,y2]=corners[k+1];
    entities += `0\nLINE\n8\nSEAM\n10\n${x1.toFixed(4)}\n20\n${y1.toFixed(4)}\n30\n0\n11\n${x2.toFixed(4)}\n21\n${y2.toFixed(4)}\n31\n0\n`;
  }

  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF`;
}
