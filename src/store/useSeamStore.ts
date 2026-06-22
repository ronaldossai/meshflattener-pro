import { create } from 'zustand';
import { Edge, SeamPath, SEAM_COLORS } from '../geometry/seamEditor';

export type SeamMode = 'view' | 'draw' | 'erase';

interface SeamStore {
  // Mode
  mode: SeamMode;
  setMode: (m: SeamMode) => void;

  // Edge map (built once per mesh load)
  edgeMap: Map<string, Edge> | null;
  setEdgeMap: (m: Map<string, Edge>) => void;

  // Seam paths
  seamPaths: SeamPath[];
  activePathId: string | null;

  // Drawing state
  pendingStart: string | null;   // first clicked edge id
  pendingPreview: string[];      // preview path while hovering

  // Actions
  startPath: (edgeId: string) => void;
  completePath: (edgeId: string, pathEdges: string[]) => void;
  cancelDraw: () => void;
  setPreview: (edgeIds: string[]) => void;
  removePath: (id: string) => void;
  clearAllSeams: () => void;
  toggleEdgeSeam: (edgeId: string) => void;

  // Computed: all active seam edge ids
  allSeamEdgeIds: () => Set<string>;
}

let pathCounter = 0;

export const useSeamStore = create<SeamStore>((set, get) => ({
  mode: 'view',
  setMode: (mode) => set({ mode, pendingStart: null, pendingPreview: [] }),

  edgeMap: null,
  setEdgeMap: (edgeMap) => set({ edgeMap }),

  seamPaths: [],
  activePathId: null,
  pendingStart: null,
  pendingPreview: [],

  startPath: (edgeId) => set({ pendingStart: edgeId, pendingPreview: [edgeId] }),

  completePath: (edgeId, pathEdges) => {
    const color = SEAM_COLORS[pathCounter % SEAM_COLORS.length];
    pathCounter++;
    const newPath: SeamPath = {
      id: `seam-${pathCounter}`,
      edgeIds: pathEdges,
      color,
    };
    // Mark edges as seams in the map
    const edgeMap = get().edgeMap;
    if (edgeMap) {
      for (const eid of pathEdges) {
        const e = edgeMap.get(eid);
        if (e) e.isSeam = true;
      }
    }
    set(s => ({
      seamPaths: [...s.seamPaths, newPath],
      activePathId: newPath.id,
      pendingStart: null,
      pendingPreview: [],
    }));
  },

  cancelDraw: () => set({ pendingStart: null, pendingPreview: [] }),

  setPreview: (edgeIds) => set({ pendingPreview: edgeIds }),

  removePath: (id) => {
    const edgeMap = get().edgeMap;
    const path = get().seamPaths.find(p => p.id === id);
    if (path && edgeMap) {
      for (const eid of path.edgeIds) {
        const e = edgeMap.get(eid);
        if (e) e.isSeam = false;
      }
    }
    set(s => ({
      seamPaths: s.seamPaths.filter(p => p.id !== id),
      activePathId: s.activePathId === id ? null : s.activePathId,
    }));
  },

  clearAllSeams: () => {
    const edgeMap = get().edgeMap;
    if (edgeMap) {
      for (const e of edgeMap.values()) e.isSeam = false;
    }
    set({ seamPaths: [], activePathId: null, pendingStart: null, pendingPreview: [] });
  },

  toggleEdgeSeam: (edgeId) => {
    const edgeMap = get().edgeMap;
    if (!edgeMap) return;
    const edge = edgeMap.get(edgeId);
    if (!edge) return;
    if (edge.isSeam) {
      // Find and remove path containing this edge
      const path = get().seamPaths.find(p => p.edgeIds.includes(edgeId));
      if (path) get().removePath(path.id);
    } else {
      edge.isSeam = true;
      const color = SEAM_COLORS[pathCounter % SEAM_COLORS.length];
      pathCounter++;
      set(s => ({
        seamPaths: [...s.seamPaths, { id: `seam-${pathCounter}`, edgeIds: [edgeId], color }],
      }));
    }
  },

  allSeamEdgeIds: () => {
    const ids = new Set<string>();
    for (const path of get().seamPaths) {
      for (const eid of path.edgeIds) ids.add(eid);
    }
    return ids;
  },
}));
