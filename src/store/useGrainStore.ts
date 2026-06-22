import { create } from 'zustand';

export type GrainSnap = 'free' | '45' | '90';

interface GrainStore {
  // panelId → angle in degrees (0 = horizontal grain)
  grainAngles: Map<string, number>;
  snapMode: GrainSnap;

  setGrainAngle: (panelId: string, angle: number) => void;
  setSnapMode: (mode: GrainSnap) => void;
  getAngle: (panelId: string) => number;
  resetAll: () => void;
}

function snapAngle(angle: number, mode: GrainSnap): number {
  const normalized = ((angle % 360) + 360) % 360;
  if (mode === 'free') return normalized;
  const step = mode === '45' ? 45 : 90;
  return Math.round(normalized / step) * step % 360;
}

export const useGrainStore = create<GrainStore>((set, get) => ({
  grainAngles: new Map(),
  snapMode: '90',

  setGrainAngle: (panelId, rawAngle) => {
    const angle = snapAngle(rawAngle, get().snapMode);
    set(s => {
      const next = new Map(s.grainAngles);
      next.set(panelId, angle);
      return { grainAngles: next };
    });
  },

  setSnapMode: (snapMode) => set({ snapMode }),

  getAngle: (panelId) => get().grainAngles.get(panelId) ?? 0,

  resetAll: () => set({ grainAngles: new Map() }),
}));
