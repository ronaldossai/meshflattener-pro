import { create } from 'zustand';
import { Panel, PanelLayout } from '../geometry/panelSplitter';

interface PanelStore {
  layout: PanelLayout | null;
  selectedPanelId: string | null;
  isProcessing: boolean;

  setLayout: (layout: PanelLayout) => void;
  selectPanel: (id: string | null) => void;
  setProcessing: (v: boolean) => void;
  clearPanels: () => void;
  updatePanelLabel: (id: string, label: string) => void;
}

export const usePanelStore = create<PanelStore>((set, get) => ({
  layout: null,
  selectedPanelId: null,
  isProcessing: false,

  setLayout: (layout) => set({ layout, selectedPanelId: null }),
  selectPanel: (selectedPanelId) => set({ selectedPanelId }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  clearPanels: () => set({ layout: null, selectedPanelId: null }),

  updatePanelLabel: (id, label) => set(s => {
    if (!s.layout) return s;
    return {
      layout: {
        ...s.layout,
        panels: s.layout.panels.map(p => p.id === id ? { ...p, label } : p),
      },
    };
  }),
}));
