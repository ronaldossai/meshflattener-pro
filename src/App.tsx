import { Suspense, useMemo, useState } from 'react';
import STLViewer from './components/STLViewer';
import FlatView from './components/FlatView';
import Sidebar from './components/Sidebar';
import MultiPanelView from './components/MultiPanelView';
import NestingView from './components/NestingView';
import EdgePickLayer, { SeamLinesOverlay } from './components/SeamEditorOverlay';
import PanelColorOverlay from './components/PanelColorOverlay';
import { useMeshStore } from './store/useMeshStore';
import { usePanelStore } from './store/usePanelStore';
import { useNestingStore } from './store/useNestingStore';

const tabs = [
  { id: '3d', label: '1 · PREPARE' },
  { id: 'flat', label: 'FLAT PATTERN' },
  { id: 'distortion', label: 'DISTORTION MAP' },
  { id: 'panels', label: '2 · PANELS' },
  { id: 'nesting', label: '3 · NEST & EXPORT' },
] as const;

export default function App() {
  const { mesh, flatResult, activePanel, setActivePanel, stats, seamAllowance, fileName } = useMeshStore();
  const { layout } = usePanelStore();
  const { result: nestingResult } = useNestingStore();
  const [panelsMode, setPanelsMode] = useState<'flat' | 'distortion'>('flat');

  const faces = useMemo(() => {
    if (!mesh) return [];
    const pos = mesh.attributes.position, idx = mesh.index;
    const f: number[][] = [];
    if (idx) { for(let i=0;i<idx.count;i+=3) f.push([idx.getX(i),idx.getX(i+1),idx.getX(i+2)]); }
    else { for(let i=0;i<pos.count;i+=3) f.push([i,i+1,i+2]); }
    return f;
  }, [mesh]);

  return (
    <div className="w-screen h-screen bg-surface text-white flex flex-col select-none overflow-hidden">

      {/* Header */}
      <header className="h-12 border-b border-border flex items-center px-5 gap-3 shrink-0 bg-panel">
        <div className="w-5 h-5 bg-accent"
          style={{ clipPath: 'polygon(50% 0%,100% 100%,0% 100%)' }} />
        <span className="text-accent font-bold tracking-[0.12em] text-sm uppercase">
          MeshFlattener Pro
        </span>
        <span className="bg-[#9a8630] text-accent text-[9px] px-2 py-0.5 tracking-[0.1em]">
          v1.0
        </span>
        <div className="ml-auto flex items-center gap-4 text-[10px] text-muted">
          {stats && (
            <>
              <span>{fileName}</span>
              <span>·</span>
              <span>{stats.faces.toLocaleString()} faces</span>
              <span>·</span>
              <span>{stats.vertices.toLocaleString()} verts</span>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <Sidebar />

        {/* Main viewport */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Toolbar / Tabs */}
          <div className="h-10 bg-panel border-b border-border flex items-center px-4 gap-1 shrink-0">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id)}
                className={`px-4 h-full text-[11px] tracking-wider border-b-2 transition-all
                  ${activePanel === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted hover:text-white'}`}
              >
                {tab.label}
              </button>
            ))}

            <div className="ml-auto flex gap-3 text-[10px] text-muted">
              {flatResult && (activePanel === 'flat' || activePanel === 'distortion') && (
                <span className="text-success">✓ Flattened</span>
              )}
              {activePanel === '3d' && <span>Orbit: Left drag · Zoom: Scroll · Pan: Right drag</span>}
            </div>
          </div>

          {/* Viewport */}
          <div className="flex-1 relative overflow-hidden bg-surface">

            {/* No mesh loaded */}
            {!mesh && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted">
                <div className="text-6xl opacity-20">⬡</div>
                <p className="text-sm tracking-widest uppercase opacity-40">
                  Load an STL file or select a demo mesh
                </p>
              </div>
            )}

            {/* 3D View: prepare & seam editing */}
            {activePanel === '3d' && (
              <div className="absolute inset-0">
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full text-muted text-sm">
                    Loading 3D engine…
                  </div>
                }>
                  <STLViewer geometry={mesh}>
                    <EdgePickLayer />
                    <SeamLinesOverlay />
                    <PanelColorOverlay />
                  </STLViewer>
                </Suspense>
              </div>
            )}

            {/* Flat / Distortion view */}
            {(activePanel === 'flat' || activePanel === 'distortion') && flatResult && (
              <div className="absolute inset-0">
                <FlatView
                  flat2d={flatResult.flat2d}
                  faces={faces}
                  distortion={flatResult.distortion}
                  seamAllowance={seamAllowance}
                  mode={activePanel === 'distortion' ? 'distortion' : 'flat'}
                />
              </div>
            )}

            {/* Not yet flattened */}
            {(activePanel === 'flat' || activePanel === 'distortion') && !flatResult && mesh && (
              <div className="absolute inset-0 flex items-center justify-center text-muted text-sm tracking-wider animate-pulse">
                FLATTENING…
              </div>
            )}

            {/* Panels view: per-piece flatten results */}
            {activePanel === 'panels' && (
              <div className="absolute inset-0">
                {layout && layout.panels.length > 0 ? (
                  <>
                    <div className="absolute top-3 right-3 z-10 flex gap-1 bg-panel/80 border border-border rounded p-1">
                      {(['flat', 'distortion'] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => setPanelsMode(m)}
                          className={`px-3 py-1 text-[10px] tracking-wider rounded transition-all
                            ${panelsMode === m ? 'bg-accent/20 text-accent' : 'text-muted hover:text-white'}`}
                        >
                          {m.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <MultiPanelView panels={layout.panels} seamAllowance={seamAllowance} mode={panelsMode} />
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
                    <div className="text-6xl opacity-20">⬡</div>
                    <p className="text-sm tracking-widest uppercase opacity-40">No panels yet</p>
                    <p className="text-[11px] opacity-30">Place seams in Prepare, then split in the Panel Manager</p>
                  </div>
                )}
              </div>
            )}

            {/* Nesting view: sheet layout & export */}
            {activePanel === 'nesting' && (
              <div className="absolute inset-0">
                {nestingResult ? (
                  <NestingView result={nestingResult} />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
                    <div className="text-6xl opacity-20">⬡</div>
                    <p className="text-sm tracking-widest uppercase opacity-40">No layout yet</p>
                    <p className="text-[11px] opacity-30">Run the nesting optimizer in the sidebar</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Status bar */}
      <footer className="h-6 bg-panel border-t border-border flex items-center px-4 gap-6 text-[9px] text-muted shrink-0">
        <span className="text-accent/60 tracking-widest">MESHFLATTENER PRO</span>
        <span>Electron + React + Three.js</span>
        {stats && <span>Surface Area: {stats.surfaceArea.toFixed(1)} units²</span>}
        <span className="ml-auto">Seam: {seamAllowance}mm · Ready</span>
      </footer>
    </div>
  );
}
