import { useCallback, useState } from 'react';
import { usePanelStore } from '../store/usePanelStore';
import { useMeshStore } from '../store/useMeshStore';
import { useSeamStore } from '../store/useSeamStore';
import { splitMeshIntoPanels } from '../geometry/panelSplitter';
import { applySeamsToGeometry } from '../geometry/seamEditor';
import { exportSVG, exportDXF } from '../exporters/exportUtils';

export default function PanelManagerPanel() {
  const { layout, selectedPanelId, selectPanel, setLayout, setProcessing, isProcessing, updatePanelLabel, clearPanels } = usePanelStore();
  const { mesh, algorithm, seamAllowance } = useMeshStore();
  const { seamPaths, allSeamEdgeIds, edgeMap } = useSeamStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const handleSplit = useCallback(() => {
    if (!mesh || !edgeMap) return;
    setProcessing(true);
    setTimeout(() => {
      try {
        const seamIds = allSeamEdgeIds();
        const splitGeo = applySeamsToGeometry(mesh, seamIds, edgeMap);
        const panelLayout = splitMeshIntoPanels(splitGeo, seamIds, edgeMap, algorithm);
        setLayout(panelLayout);
      } catch (e) {
        console.error('Panel split failed:', e);
      } finally {
        setProcessing(false);
      }
    }, 30);
  }, [mesh, edgeMap, algorithm, allSeamEdgeIds, setLayout, setProcessing]);

  const exportPanel = useCallback((panelId: string, format: 'svg' | 'dxf') => {
    if (!layout) return;
    const panel = layout.panels.find(p => p.id === panelId);
    if (!panel?.flatResult) return;

    const { flat2d, distortion } = panel.flatResult;
    const pidx = panel.geometry.index!;
    const faces: number[][] = [];
    for (let fi = 0; fi < pidx.count / 3; fi++) {
      faces.push([pidx.getX(fi*3), pidx.getX(fi*3+1), pidx.getX(fi*3+2)]);
    }

    if (format === 'svg') {
      const svg = exportSVG(flat2d, faces, distortion, seamAllowance, panel.label);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${panel.label.replace(' ', '_')}.svg`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const dxf = exportDXF(flat2d, faces, seamAllowance);
      const blob = new Blob([dxf], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${panel.label.replace(' ', '_')}.dxf`; a.click();
      URL.revokeObjectURL(url);
    }
  }, [layout, seamAllowance]);

  const exportAll = useCallback((format: 'svg' | 'dxf') => {
    if (!layout) return;
    layout.panels.forEach(p => exportPanel(p.id, format));
  }, [layout, exportPanel]);

  const selectedPanel = layout?.panels.find(p => p.id === selectedPanelId);

  return (
    <div className="flex flex-col gap-4">

      {/* Split action */}
      <div>
        <span className="section-label">Split Mesh</span>
        <div className="text-[10px] text-muted/70 mb-3 leading-relaxed">
          {seamPaths.length === 0
            ? 'Place seams in the Seam Editor first, then split into panels.'
            : `${seamPaths.length} seam path${seamPaths.length > 1 ? 's' : ''} ready. Click to split.`}
        </div>
        <button
          onClick={handleSplit}
          disabled={!mesh || isProcessing}
          className={`btn-accent w-full text-center ${(!mesh || isProcessing) ? 'opacity-30 cursor-not-allowed' : ''}`}
        >
          {isProcessing ? '⟳ SPLITTING…' : '⬡ SPLIT INTO PANELS'}
        </button>
        {layout && (
          <button onClick={clearPanels} className="mt-1.5 w-full border border-border text-muted text-xs px-3 py-1.5 hover:border-danger hover:text-danger transition-all">
            ✕ Clear Panels
          </button>
        )}
      </div>

      {/* Summary */}
      {layout && (
        <div className="panel-section">
          <span className="section-label">Summary</span>
          <div className="flex flex-col gap-1 text-[11px]">
            {[
              ['Panels', layout.panels.length],
              ['Seam edges', layout.seamCount],
              ['Total area', `${layout.totalArea3d.toFixed(1)} u²`],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between border-b border-border pb-1">
                <span className="text-muted">{k}</span>
                <span className="text-accent">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panel list */}
      {layout && layout.panels.length > 0 && (
        <div>
          <span className="section-label">Panels ({layout.panels.length})</span>
          <div className="flex flex-col gap-1 max-h-52 overflow-y-auto pr-1">
            {layout.panels.map(panel => (
              <div
                key={panel.id}
                onClick={() => selectPanel(panel.id === selectedPanelId ? null : panel.id)}
                className={`flex items-center gap-2 px-2 py-2 border rounded cursor-pointer transition-all group
                  ${panel.id === selectedPanelId
                    ? 'border-opacity-60 bg-opacity-5'
                    : 'border-border hover:border-opacity-40'}`}
                style={{
                  borderColor: panel.id === selectedPanelId ? panel.color : undefined,
                  background: panel.id === selectedPanelId ? `${panel.color}10` : undefined,
                }}
              >
                {/* Color dot */}
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: panel.color }} />

                {/* Label / edit */}
                {editingId === panel.id ? (
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    onBlur={() => { updatePanelLabel(panel.id, editLabel); setEditingId(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') { updatePanelLabel(panel.id, editLabel); setEditingId(null); } }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-transparent border-b border-accent text-accent text-[10px] outline-none"
                  />
                ) : (
                  <span className="text-[10px] flex-1 truncate" style={{ color: panel.id === selectedPanelId ? panel.color : '#e2e4ea' }}>
                    {panel.label}
                  </span>
                )}

                {/* Face count */}
                <span className="text-[9px] text-muted/50 shrink-0">{panel.faceCount}f</span>

                {/* Rename btn */}
                <button
                  onClick={e => { e.stopPropagation(); setEditingId(panel.id); setEditLabel(panel.label); }}
                  className="text-[9px] text-muted/30 hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="Rename"
                >✎</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected panel detail */}
      {selectedPanel && (
        <div className="border rounded p-3 flex flex-col gap-2" style={{ borderColor: `${selectedPanel.color}40` }}>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: selectedPanel.color }} />
            <span className="text-[11px] font-bold" style={{ color: selectedPanel.color }}>{selectedPanel.label}</span>
          </div>
          <div className="text-[10px] text-muted flex flex-col gap-0.5">
            <div className="flex justify-between"><span>Faces</span><span className="text-accent">{selectedPanel.faceCount}</span></div>
            <div className="flex justify-between"><span>Vertices</span><span className="text-accent">{selectedPanel.vertexCount}</span></div>
            <div className="flex justify-between"><span>3D area</span><span className="text-accent">{selectedPanel.area3d.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>2D area</span><span className="text-accent">{selectedPanel.area2d.toFixed(2)}</span></div>
            {selectedPanel.boundingBox2d && (
              <div className="flex justify-between">
                <span>Size</span>
                <span className="text-accent">
                  {(selectedPanel.boundingBox2d.maxX - selectedPanel.boundingBox2d.minX).toFixed(1)} × {(selectedPanel.boundingBox2d.maxY - selectedPanel.boundingBox2d.minY).toFixed(1)}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-1.5 mt-1">
            <button onClick={() => exportPanel(selectedPanel.id, 'svg')}
              className="flex-1 border border-success/50 text-success text-[10px] py-1 hover:bg-success/10 transition-all rounded">
              SVG
            </button>
            <button onClick={() => exportPanel(selectedPanel.id, 'dxf')}
              className="flex-1 border border-success/50 text-success text-[10px] py-1 hover:bg-success/10 transition-all rounded">
              DXF
            </button>
          </div>
        </div>
      )}

      {/* Export all */}
      {layout && layout.panels.length > 0 && (
        <div>
          <span className="section-label">Export All</span>
          <div className="flex gap-1.5">
            <button onClick={() => exportAll('svg')} className="flex-1 btn-accent text-center">↓ All SVG</button>
            <button onClick={() => exportAll('dxf')} className="flex-1 btn-accent text-center">↓ All DXF</button>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="border border-border/50 rounded p-3 text-[9px] text-muted/60 leading-relaxed">
        <div className="text-muted/80 font-bold mb-1 tracking-wider">HOW IT WORKS</div>
        <div>• Flood-fill detects face regions separated by seams</div>
        <div>• Each region becomes an independent flat panel</div>
        <div>• Click a panel to inspect its details</div>
        <div>• Double-click label in list to rename</div>
        <div>• Export individual or all panels as SVG/DXF</div>
      </div>
    </div>
  );
}
