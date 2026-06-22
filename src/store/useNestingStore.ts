import { create } from 'zustand';
import { NestingResult, SheetConfig, SHEET_PRESETS } from '../geometry/nestingOptimizer';

interface NestingStore {
  result: NestingResult | null;
  config: SheetConfig;
  isProcessing: boolean;

  setResult: (r: NestingResult | null) => void;
  setConfig: (c: Partial<SheetConfig>) => void;
  setProcessing: (v: boolean) => void;
  clearNesting: () => void;
}

export const useNestingStore = create<NestingStore>((set) => ({
  result: null,
  isProcessing: false,
  config: {
    width: SHEET_PRESETS[0].width,
    height: SHEET_PRESETS[0].height,
    seamAllowance: 10,
    allowRotation: true,
    respectGrain: false,
  },

  setResult: (result) => set({ result }),
  setConfig: (c) => set(s => ({ config: { ...s.config, ...c } })),
  setProcessing: (isProcessing) => set({ isProcessing }),
  clearNesting: () => set({ result: null }),
}));
