import { useCallback } from 'react';
import { useMeshStore } from '../store/useMeshStore';
import { useSeamStore, SeamMode } from '../store/useSeamStore';
import { flattenGeometry } from '../geometry/flattenEngine';
import { applySeamsToGeometry } from '../geometry/seamEditor';

interface SeamPanelProps {
  onReflatten: () => void;
}

export default function SeamPanel({ onReflatten }: SeamPanelProps) {
  const { mesh, algorithm } = useMeshStore();
  const {
    mode, setMode,
    seamPaths, removePath, clearAllSeams,
    pendingStart, cancelDraw,
    allSeamEdgeIds, edgeMap,
  } = useSeamStore();
  const { setFlatResult } = useMeshStore();

  const modeButtons: { id: SeamMode; label: string; icon: string; desc: string }[] = [
    { id: 'view',  label: 'VIEW',  icon: '👁', desc: 'Orbit & inspect' },
    { id: 'draw',  label: 'DRAW',  icon: '✏',  desc: 'Click edges to place seams' },
    { id: 'erase', label: 'ERASE', icon: '✕',  desc: 'Click seams to remove' },
  ];

  const handleReflatten = useCallback(() => {
    if (!mesh || !edgeMap) return;
    const seamIds = allSeamEdgeIds();
    const splitGeo = applySeamsToGeometry(mesh, seamIds, edgeMap);
    const result = flattenGeometry(splitGeo, algorithm);
    setFlatResult(result);
    onReflatten();
  }, [mesh, edgeMap, allSeamEdgeIds, algorithm, setFlatResult, onReflatten]);

  const seamCount = seamPaths.reduce((a, p) => a + p.edgeIds.length, 0);

  return (
    <div className="flex flex-col gap-4">

      {/* Mode selector */}
      <div>
        <span className="section-label">Editor Mode</span>
        <div className="flex flex-col gap-1">
          {modeButtons.map(btn => (
            <button
              key={btn.id}
              onClick={() => setMode(btn.id)}
              className={`flex items-center gap-2 px-3 py-2 text-xs border rounded transition-all text-left
                ${mode === btn.id
                  ? btn.id === 'draw'   ? 'border-accent bg-accent/10 text-accent'
                  : btn.id === 'erase'  ? 'border-danger bg-danger/10 text-danger'
                  : 'border-success bg-success/10 text-success'
                  : 'border-border text-muted hover:border-accent/40'
                }`}
            >
              <span className="w-4 text-center">{btn.icon}</span>
              <div>
                <div className="tracking-widest font-bold">{btn.label}</div>
                <div className="text-[9px] opacity-60">{btn.desc}</div>
              </div>
              {mode === btn.id && (
                <span className="ml-auto text-[9px] animate-pulse">●</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Draw mode instructions */}
      {mode === 'draw' && (
        <div className="bg-accent/5 border border-accent/20 rounded p-3 text-[10px] text-accent/80 leading-relaxed">
          {!pendingStart ? (
            <>
              <div className="font-bold mb-1">CLICK to start a seam</div>
              <div>Click any edge on the mesh to begin a seam path</div>
            </>
          ) : (
            <>
              <div className="font-bold mb-1">CLICK to complete seam</div>
              <div>Click another edge to connect · Right-click to cancel</div>
              <button
                onClick={cancelDraw}
                className="mt-2 text-danger/80 hover:text-danger text-[9px] underline"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="flex justify-between text-[11px] border-b border-border pb-3">
        <span className="text-muted">Seam paths</span>
        <span className="text-accent">{seamPaths.length}</span>
      </div>
      <div className="flex justify-between text-[11px] border-b border-border pb-3">
        <span className="text-muted">Seam edges</span>
        <span className="text-accent">{seamCount}</span>
      </div>

      {/* Seam list */}
      {seamPaths.length > 0 && (
        <div>
          <span className="section-label">Seam Paths</span>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {seamPaths.map((path, i) => (
              <div key={path.id}
                className="flex items-center gap-2 px-2 py-1.5 border border-border rounded hover:border-border/80 group"
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: path.color }} />
                <span className="text-[10px] text-muted flex-1">
                  Seam {i + 1}
                  <span className="ml-2 text-[9px] opacity-50">
                    {path.edgeIds.length} edges
                  </span>
                </span>
                <button
                  onClick={() => removePath(path.id)}
                  className="text-[10px] text-muted/40 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-1.5 pt-1">
        <button
          onClick={handleReflatten}
          disabled={!mesh}
          className={`btn-accent text-center ${!mesh ? 'opacity-30 cursor-not-allowed' : ''}`}
        >
          ↻ RE-FLATTEN WITH SEAMS
        </button>
        {seamPaths.length > 0 && (
          <button
            onClick={clearAllSeams}
            className="border border-danger/30 text-danger/70 px-3 py-1.5 text-xs tracking-wider hover:border-danger hover:text-danger transition-all rounded"
          >
            ✕ CLEAR ALL SEAMS
          </button>
        )}
      </div>

      {/* Tips */}
      <div className="border border-border/50 rounded p-3 text-[9px] text-muted/60 leading-relaxed">
        <div className="text-muted/80 font-bold mb-1 tracking-wider">TIPS</div>
        <div>• Place seams along sharp curves to reduce distortion</div>
        <div>• Follow natural fold lines in upholstery</div>
        <div>• More seams = better fit, more cut pieces</div>
        <div>• Re-flatten after placing seams</div>
      </div>
    </div>
  );
}
