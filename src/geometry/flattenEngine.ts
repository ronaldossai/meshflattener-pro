import * as THREE from 'three';

// ── Vector helpers ──────────────────────────────────────────────────────────
export const sub3 = (a: number[], b: number[]) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const cross3 = (a: number[], b: number[]) => [
  a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]
];
export const dot3 = (a: number[], b: number[]) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const len3 = (v: number[]) => Math.sqrt(v[0]**2+v[1]**2+v[2]**2);
export const norm3 = (v: number[]) => { const l=len3(v); return l>0?[v[0]/l,v[1]/l,v[2]/l]:[0,0,1]; };

// ── Parse raw geometry into vertex/face arrays ──────────────────────────────
export function extractGeometry(geo: THREE.BufferGeometry): {
  verts: number[][];
  faces: number[][];
} {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const verts: number[][] = [];
  const faces: number[][] = [];

  if (idx) {
    for (let i = 0; i < pos.count; i++) {
      verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
    }
    for (let i = 0; i < idx.count; i += 3) {
      faces.push([idx.getX(i), idx.getX(i+1), idx.getX(i+2)]);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      const base = verts.length;
      verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
      verts.push([pos.getX(i+1), pos.getY(i+1), pos.getZ(i+1)]);
      verts.push([pos.getX(i+2), pos.getY(i+2), pos.getZ(i+2)]);
      faces.push([base, base+1, base+2]);
    }
  }
  return { verts, faces };
}

// ── Compute mesh statistics ─────────────────────────────────────────────────
export function computeStats(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const pos = geo.attributes.position;
  const idx = geo.index;
  let area = 0;
  const faceCount = idx ? idx.count / 3 : pos.count / 3;
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  for (let i = 0; i < faceCount; i++) {
    if (idx) {
      vA.fromBufferAttribute(pos, idx.getX(i*3));
      vB.fromBufferAttribute(pos, idx.getX(i*3+1));
      vC.fromBufferAttribute(pos, idx.getX(i*3+2));
    } else {
      vA.fromBufferAttribute(pos, i*3);
      vB.fromBufferAttribute(pos, i*3+1);
      vC.fromBufferAttribute(pos, i*3+2);
    }
    const ab = new THREE.Vector3().subVectors(vB, vA);
    const ac = new THREE.Vector3().subVectors(vC, vA);
    area += ab.cross(ac).length() / 2;
  }
  return {
    vertices: pos.count,
    faces: faceCount,
    boundingBox: { min: bb.min.clone(), max: bb.max.clone() },
    surfaceArea: area,
  };
}

// ── PCA best-fit plane projection (Projection mode) ─────────────────────────
function projectOntoPlane(verts: number[][]): [number, number][] {
  let cx=0, cy=0, cz=0;
  for (const [x,y,z] of verts) { cx+=x; cy+=y; cz+=z; }
  cx/=verts.length; cy/=verts.length; cz/=verts.length;

  let cxx=0,cxy=0,cxz=0,cyy=0,cyz=0,czz=0;
  for (const [x,y,z] of verts) {
    const dx=x-cx,dy=y-cy,dz=z-cz;
    cxx+=dx*dx;cxy+=dx*dy;cxz+=dx*dz;cyy+=dy*dy;cyz+=dy*dz;czz+=dz*dz;
  }
  let n=[cxz,cyz,czz];
  for(let i=0;i<30;i++){
    const nx=cxx*n[0]+cxy*n[1]+cxz*n[2];
    const ny=cxy*n[0]+cyy*n[1]+cyz*n[2];
    const nz=cxz*n[0]+cyz*n[1]+czz*n[2];
    n=norm3([nx,ny,nz]);
  }
  const t1 = Math.abs(n[0])<0.9 ? norm3(cross3(n,[1,0,0])) : norm3(cross3(n,[0,1,0]));
  const t2 = norm3(cross3(n,t1));
  return verts.map(([x,y,z])=>{
    const d=[x-cx,y-cy,z-cz];
    return [dot3(d,t1), dot3(d,t2)];
  });
}

// ── ARAP-inspired iterative flattening ──────────────────────────────────────
function flattenARAP(verts: number[][], faces: number[][]): [number, number][] {
  // Initialise with projection
  let uv = projectOntoPlane(verts);
  const iterations = 6;

  // Build 1-ring neighbourhoods
  const nbr: Map<number, Set<number>> = new Map();
  for (let i=0; i<verts.length; i++) nbr.set(i, new Set());
  for (const [a,b,c] of faces) {
    nbr.get(a)!.add(b); nbr.get(a)!.add(c);
    nbr.get(b)!.add(a); nbr.get(b)!.add(c);
    nbr.get(c)!.add(a); nbr.get(c)!.add(b);
  }

  for (let iter=0; iter<iterations; iter++) {
    const newUV: [number,number][] = uv.map(p => [...p] as [number,number]);
    for (let i=0; i<verts.length; i++) {
      const ns = Array.from(nbr.get(i)!);
      if (ns.length === 0) continue;
      let su=0, sv=0, w=0;
      for (const j of ns) {
        const d3 = len3(sub3(verts[i], verts[j]));
        const d2 = Math.sqrt((uv[i][0]-uv[j][0])**2+(uv[i][1]-uv[j][1])**2)||0.0001;
        const weight = d3 / d2;
        su += uv[j][0] * weight;
        sv += uv[j][1] * weight;
        w += weight;
      }
      // Pin first vertex to prevent drift
      if (i > 0) { newUV[i] = [su/w, sv/w]; }
    }
    uv = newUV;
  }
  return uv;
}

// ── LSCM conformal flattening ────────────────────────────────────────────────
function flattenLSCM(verts: number[][], faces: number[][]): [number, number][] {
  // Simplified LSCM using cotangent weights for angle preservation
  const uv = projectOntoPlane(verts);
  const nbr: Map<number, number[]> = new Map();
  for (let i=0; i<verts.length; i++) nbr.set(i, []);

  for (const [a,b,c] of faces) {
    // Compute cotangent weights
    const va=verts[a], vb=verts[b], vc=verts[c];
    const ab=sub3(vb,va), ac=sub3(vc,va), bc=sub3(vc,vb);
    const cotA = dot3(ab,ac)/(len3(cross3(ab,ac))||0.0001);
    const cotB = dot3(sub3(va,vb),bc)/(len3(cross3(sub3(va,vb),bc))||0.0001);
    const cotC = dot3(sub3(va,vc),sub3(vb,vc))/(len3(cross3(sub3(va,vc),sub3(vb,vc)))||0.0001);
    nbr.get(a)!.push(b, cotC, c, cotB);
    nbr.get(b)!.push(a, cotC, c, cotA);
    nbr.get(c)!.push(a, cotB, b, cotA);
  }

  const smooth: [number,number][] = uv.map(p => [...p] as [number,number]);
  for (let iter=0; iter<8; iter++) {
    for (let i=1; i<verts.length; i++) {
      const ns = nbr.get(i)!;
      let su=0, sv=0, wt=0;
      for (let k=0; k<ns.length; k+=2) {
        const j=ns[k], w=Math.max(0.01, ns[k+1]);
        su += uv[j][0]*w; sv += uv[j][1]*w; wt+=w;
      }
      if (wt>0) smooth[i]=[su/wt, sv/wt];
    }
  }
  return smooth;
}

// ── Distortion computation ───────────────────────────────────────────────────
function computeDistortion(
  verts: number[][], faces: number[][], flat2d: [number,number][]
): number[] {
  const d = faces.map(([a,b,c]) => {
    const ab3=sub3(verts[b],verts[a]), ac3=sub3(verts[c],verts[a]);
    const area3 = len3(cross3(ab3,ac3))/2;
    const ab2=[flat2d[b][0]-flat2d[a][0], flat2d[b][1]-flat2d[a][1]];
    const ac2=[flat2d[c][0]-flat2d[a][0], flat2d[c][1]-flat2d[a][1]];
    const area2 = Math.abs(ab2[0]*ac2[1]-ab2[1]*ac2[0])/2;
    return area3>0.0001 ? area2/area3 : 1;
  });
  const mean = d.reduce((a,b)=>a+b,0)/d.length;
  return d.map(v => v/(mean||1));
}

// ── Main entry point ─────────────────────────────────────────────────────────
export function flattenGeometry(
  geo: THREE.BufferGeometry,
  algorithm: 'ARAP' | 'LSCM' | 'Projection'
): { flat2d: [number, number][]; distortion: number[] } {
  const { verts, faces } = extractGeometry(geo);

  let flat2d: [number,number][];
  if (algorithm === 'ARAP') flat2d = flattenARAP(verts, faces);
  else if (algorithm === 'LSCM') flat2d = flattenLSCM(verts, faces);
  else flat2d = projectOntoPlane(verts);

  const distortion = computeDistortion(verts, faces, flat2d);
  return { flat2d, distortion };
}

// ── Demo mesh generators ─────────────────────────────────────────────────────
export function makeCushionGeometry(res=12): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for(let i=0;i<=res;i++) for(let j=0;j<=res;j++){
    const u=i/res, v=j/res;
    positions.push((u-0.5)*3, (v-0.5)*2, 0.9*Math.sin(Math.PI*u)*Math.sin(Math.PI*v));
  }
  for(let i=0;i<res;i++) for(let j=0;j<res;j++){
    const a=i*(res+1)+j,b=a+1,c=a+(res+1),d=c+1;
    indices.push(a,b,c,b,d,c);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.scale(180, 180, 180); // realistic mm scale (STL convention) for nesting/export
  return geo;
}

export function makeSaddleGeometry(res=12): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for(let i=0;i<=res;i++) for(let j=0;j<=res;j++){
    const x=(i/res-0.5)*2, y=(j/res-0.5)*2;
    positions.push(x, y, x*x-y*y);
  }
  for(let i=0;i<res;i++) for(let j=0;j<res;j++){
    const a=i*(res+1)+j,b=a+1,c=a+(res+1),d=c+1;
    indices.push(a,b,c,b,d,c);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.scale(150, 150, 150); // realistic mm scale (STL convention) for nesting/export
  return geo;
}

export function makeCylinderGeometry(res=20, rows=10): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for(let i=0;i<=rows;i++) for(let j=0;j<=res;j++){
    const a=(j/res)*Math.PI*2, h=i/rows*2-1;
    positions.push(Math.cos(a), Math.sin(a), h);
  }
  for(let i=0;i<rows;i++) for(let j=0;j<res;j++){
    const a=i*(res+1)+j,b=a+1,c=a+(res+1),d=c+1;
    indices.push(a,b,c,b,d,c);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.scale(150, 150, 150); // realistic mm scale (STL convention) for nesting/export
  return geo;
}
