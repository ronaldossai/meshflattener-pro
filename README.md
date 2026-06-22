# MeshFlattener Pro — Setup Guide

## Prerequisites
- Node.js LTS (https://nodejs.org)
- VS Code (recommended)

## Quick Start

### 1. Install dependencies
```bash
cd meshflattener-pro
npm install
```

### 2. Run as web app (no Electron)
```bash
npm run dev
# Open http://localhost:5173
```

### 3. Run as desktop app (Electron)
```bash
npm run electron-dev
```
This starts the React dev server AND Electron window simultaneously.

### 4. Build for production (Windows .exe)
```bash
npm run build-electron
# Output in dist-electron/
```

## Project Structure
```
meshflattener-pro/
├── electron/
│   ├── main.js          ← Electron main process
│   └── preload.js       ← Secure bridge (contextBridge)
├── src/
│   ├── components/
│   │   ├── STLViewer.tsx    ← Three.js 3D viewport
│   │   ├── FlatView.tsx     ← 2D pattern canvas
│   │   └── Sidebar.tsx      ← Controls panel
│   ├── geometry/
│   │   └── flattenEngine.ts ← ARAP / LSCM / Projection algorithms
│   ├── exporters/
│   │   └── exportUtils.ts   ← SVG + DXF export
│   ├── store/
│   │   └── useMeshStore.ts  ← Zustand global state
│   ├── styles/
│   │   └── index.css        ← Tailwind + custom styles
│   ├── App.tsx              ← Main layout
│   └── main.tsx             ← React entry point
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Features
- STL file loading (drag & drop or file picker)
- 3 demo meshes: Seat Cushion, Saddle Surface, Cylinder
- 3 flattening algorithms: ARAP, LSCM, Projection
- Distortion heatmap visualization
- Adjustable seam allowance
- Export to SVG (preview) and DXF (CNC cutting machines)
- GPU-accelerated 3D viewer with orbit controls

## Next Steps (Roadmap)
1. Real seam/cut line editor (click to place seams)
2. Multi-panel splitting for complex geometry
3. Nesting optimization (pack patterns to minimize waste)
4. Grain direction alignment per panel
5. PDF export with scale markers
6. Auto-topology repair (weld vertices, fix normals)
