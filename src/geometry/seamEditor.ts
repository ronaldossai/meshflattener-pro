import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────
export interface Edge {
  id: string;
  v0: number;
  v1: number;
  faces: number[];       // which face indices share this edge
  isSeam: boolean;
  isBoundary: boolean;   // only one face → mesh boundary
  length3d: number;
  midpoint: THREE.Vector3;
}

export interface SeamPath {
  id: string;
  edgeIds: string[];
  color: string;
}

// ── Build edge map from geometry ─────────────────────────────────────────────
export function buildEdgeMap(geo: THREE.BufferGeometry): Map<string, Edge> {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const edges = new Map<string, Edge>();

  const verts: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    verts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }

  const getFaceIndices = (): number[][] => {
    const faces: number[][] = [];
    if (idx) {
      for (let i = 0; i < idx.count; i += 3)
        faces.push([idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]);
    } else {
      for (let i = 0; i < pos.count; i += 3)
        faces.push([i, i + 1, i + 2]);
    }
    return faces;
  };

  const faces = getFaceIndices();

  faces.forEach((face, fi) => {
    const pairs = [[face[0], face[1]], [face[1], face[2]], [face[2], face[0]]];
    for (const [a, b] of pairs) {
      const key = [Math.min(a, b), Math.max(a, b)].join('-');
      if (!edges.has(key)) {
        const mid = new THREE.Vector3().addVectors(verts[a], verts[b]).multiplyScalar(0.5);
        edges.set(key, {
          id: key,
          v0: Math.min(a, b),
          v1: Math.max(a, b),
          faces: [fi],
          isSeam: false,
          isBoundary: false,
          length3d: verts[a].distanceTo(verts[b]),
          midpoint: mid,
        });
      } else {
        edges.get(key)!.faces.push(fi);
      }
    }
  });

  // Mark boundary edges
  for (const edge of edges.values()) {
    if (edge.faces.length === 1) edge.isBoundary = true;
  }

  return edges;
}

// ── Find shortest seam path between two clicked edges (BFS on edge graph) ───
export function findSeamPath(
  startEdgeId: string,
  endEdgeId: string,
  edgeMap: Map<string, Edge>
): string[] {
  if (startEdgeId === endEdgeId) return [startEdgeId];

  // Build vertex → edges adjacency
  const vertEdges = new Map<number, string[]>();
  for (const [id, e] of edgeMap) {
    for (const v of [e.v0, e.v1]) {
      if (!vertEdges.has(v)) vertEdges.set(v, []);
      vertEdges.get(v)!.push(id);
    }
  }

  const start = edgeMap.get(startEdgeId)!;
  const end = edgeMap.get(endEdgeId)!;

  // BFS from start edge vertices to end edge vertices
  const queue: { edgeId: string; path: string[] }[] = [
    { edgeId: startEdgeId, path: [startEdgeId] }
  ];
  const visited = new Set<string>([startEdgeId]);

  while (queue.length > 0) {
    const { edgeId, path } = queue.shift()!;
    const edge = edgeMap.get(edgeId)!;

    // Get adjacent edges via shared vertices
    for (const v of [edge.v0, edge.v1]) {
      for (const nextId of (vertEdges.get(v) || [])) {
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        const newPath = [...path, nextId];
        if (nextId === endEdgeId) return newPath;
        queue.push({ edgeId: nextId, path: newPath });
        // Limit BFS depth for performance
        if (newPath.length > 200) continue;
      }
    }
  }

  // Fallback: just return the two edges
  return [startEdgeId, endEdgeId];
}

// ── Convert seam edges to 3D line segments for Three.js rendering ─────────────
export function seamEdgesToLines(
  edgeIds: string[],
  edgeMap: Map<string, Edge>,
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const points: number[] = [];

  for (const id of edgeIds) {
    const edge = edgeMap.get(id);
    if (!edge) continue;
    points.push(
      pos.getX(edge.v0), pos.getY(edge.v0), pos.getZ(edge.v0),
      pos.getX(edge.v1), pos.getY(edge.v1), pos.getZ(edge.v1),
    );
  }

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return lineGeo;
}

// ── Build raycasting mesh for edge picking ───────────────────────────────────
// We create thin "edge tubes" as lines for the raycaster
export function buildEdgePickMesh(
  edgeMap: Map<string, Edge>,
  geo: THREE.BufferGeometry
): { points: THREE.Vector3[]; edgeIds: string[] } {
  const pos = geo.attributes.position;
  const points: THREE.Vector3[] = [];
  const edgeIds: string[] = [];

  for (const [id, edge] of edgeMap) {
    if (edge.isBoundary) continue; // skip boundary edges from picking
    const mid = new THREE.Vector3(
      (pos.getX(edge.v0) + pos.getX(edge.v1)) / 2,
      (pos.getY(edge.v0) + pos.getY(edge.v1)) / 2,
      (pos.getZ(edge.v0) + pos.getZ(edge.v1)) / 2,
    );
    points.push(mid);
    edgeIds.push(id);
  }

  return { points, edgeIds };
}

// ── Apply seams to geometry: split mesh along seam edges for flattening ───────
export function applySeamsToGeometry(
  geo: THREE.BufferGeometry,
  seamEdgeIds: Set<string>,
  edgeMap: Map<string, Edge>
): THREE.BufferGeometry {
  if (seamEdgeIds.size === 0) return geo;

  // Duplicate vertices along seam edges so the mesh "cuts" there
  const pos = geo.attributes.position;
  const idx = geo.index;

  const newPositions: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    newPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }

  // Build seam vertex set
  const seamVerts = new Set<number>();
  for (const id of seamEdgeIds) {
    const edge = edgeMap.get(id);
    if (edge) { seamVerts.add(edge.v0); seamVerts.add(edge.v1); }
  }

  // For faces on both sides of a seam, duplicate shared vertices
  const vertRemap = new Map<string, number>(); // "origVert-faceIdx" → new vert
  const newIndices: number[] = [];

  const getFaces = () => {
    const faces: number[][] = [];
    if (idx) { for(let i=0;i<idx.count;i+=3) faces.push([idx.getX(i),idx.getX(i+1),idx.getX(i+2)]); }
    else { for(let i=0;i<pos.count;i+=3) faces.push([i,i+1,i+2]); }
    return faces;
  };
  const faces = getFaces();

  // Group faces by connectivity, splitting at seam edges
  faces.forEach((face, fi) => {
    const newFace = face.map(v => {
      if (!seamVerts.has(v)) return v;
      const key = `${v}-${fi}`;
      if (!vertRemap.has(key)) {
        const ni = newPositions.length / 3;
        newPositions.push(pos.getX(v), pos.getY(v), pos.getZ(v));
        vertRemap.set(key, ni);
      }
      return vertRemap.get(key)!;
    });
    newIndices.push(...newFace);
  });

  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  newGeo.setIndex(newIndices);
  newGeo.computeVertexNormals();
  return newGeo;
}

// ── Seam color palette ────────────────────────────────────────────────────────
export const SEAM_COLORS = [
  '#e84a4a', // red
  '#e87c3a', // orange
  '#e8c84a', // yellow
  '#4ecb71', // green
  '#4a7ae8', // blue
  '#a44ae8', // purple
  '#e84aa0', // pink
];
