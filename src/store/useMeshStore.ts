import { create } from 'zustand';
import * as THREE from 'three';

export interface MeshStats {
  vertices: number;
  faces: number;
  boundingBox: { min: THREE.Vector3; max: THREE.Vector3 };
  surfaceArea: number;
}

export interface FlatResult {
  flat2d: [number, number][];
  distortion: number[];
}

interface MeshState {
  mesh: THREE.BufferGeometry | null;
  fileName: string;
  stats: MeshStats | null;
  flatResult: FlatResult | null;
  seamAllowance: number;
  algorithm: 'ARAP' | 'LSCM' | 'Projection';
  activePanel: '3d' | 'flat' | 'distortion' | 'panels' | 'nesting';
  isProcessing: boolean;
  setMesh: (mesh: THREE.BufferGeometry, name: string, stats: MeshStats) => void;
  setFlatResult: (result: FlatResult) => void;
  setSeamAllowance: (v: number) => void;
  setAlgorithm: (a: MeshState['algorithm']) => void;
  setActivePanel: (p: MeshState['activePanel']) => void;
  setProcessing: (v: boolean) => void;
  reset: () => void;
}

export const useMeshStore = create<MeshState>((set) => ({
  mesh: null,
  fileName: '',
  stats: null,
  flatResult: null,
  seamAllowance: 10,
  algorithm: 'ARAP',
  activePanel: '3d',
  isProcessing: false,
  setMesh: (mesh, fileName, stats) => set({ mesh, fileName, stats }),
  setFlatResult: (flatResult) => set({ flatResult }),
  setSeamAllowance: (seamAllowance) => set({ seamAllowance }),
  setAlgorithm: (algorithm) => set({ algorithm }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  reset: () => set({ mesh: null, fileName: '', stats: null, flatResult: null }),
}));
