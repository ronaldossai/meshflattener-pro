import { useCallback, useState } from 'react';
import { usePanelStore } from '../store/usePanelStore';
import { useNestingStore } from '../store/useNestingStore';
import { useGrainStore, GrainSnap } from '../store/useGrainStore';
import { nestPanels, SHEET_PRESETS } from '../geometry/nestingOptimizer';
import { useMeshStore } from '../store/useMeshStore';

export default function NestingPanel() {
  const { layout } = usePanelStore();
  const { result, config, setConfig, setResult, isProcessing, setProcessing } = useNestingStore();
  const { grainAngles, snapMode, setSnapMode, setGrainAngle, resetAll } = useGrainStore();
  const { seamAllowance } = useMeshStore();
  const [presetIdx, setPresetIdx] = useState(0);

  const handlePreset = (idx: number) => {
    setPresetIdx(idx);
    const p = SHEET_PRESETS[idx];
    if (p.width > 0) setConfig({ width: p.width, height: p.height });
  };

  const handleNest = useCallback(() => {
    if (!layout) return;
    setProcessing(true);
    setTimeout(() => {
      try {
        const nestResult = nestPanels(layout.panels, { ...config, seamAllowance }, grainAngles);
        setResult(nestResult);
      } finally {
        setProcessing(false);
      }
    }, 30);
  }, [layout, config, seamAllowance, grainAngles, setResult, setProcessing]);

  const panels = layout?.panels ?? [];
  const snapOptions: GrainSnap[] = ['free', '45', '90'];

  const effColor = !result ? '#6b7080'
    : result.efficiency > 0.75 ? '#4ecb71'
    : result.efficiency > 0.5  ? '#e8c84a' : '#e84a4a';

  return (
    <div className="flex flex-col gap-4">

      {/* Sheet config */}
      <div className="panel-section">
        <span className="section-label">Sheet / Material</span>
        <div className="flex flex-col gap-2">
          <select
            value={presetIdx}
            onChange={e => handlePreset(Number(e.target.value))}
            className="w-full bg-[#1e2330] border border-border text-accent text-[10px] px-2 py-1.5 outline-none focus:border-accent"
          >
            {SHEET_PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-1.5">
            {[['Width (mm)', 'width'], ['Height (mm)', 'height']].map(([label, key]) => (
              <div key={key}>
                <div className="text-[9px] text-muted mb-0.5">{label}</div>
                <input type="number" min={100} max={10000}
                  value={config[key as 'width' | 'height']}
                  onChange={e => setConfig({ [key]: Number(e.target.value) })}
                  className="w-full bg-[#1e2330] border border-border text-accent px-2 py-1 text-[10px] outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-[10px] text-muted cursor-pointer">
            <input type="checkbox" checked={config.allowRotation}
              onChange={e => setConfig({ allowRotation: e.target.checked })}
              className="accent-yellow-400" />
            Allow 90° rotation
          </label>
          <label className="flex items-center gap-2 text-[10px] text-muted cursor-pointer">
            <input type="checkbox" checked={config.respectGrain}
              onChange={e => setConfig({ respectGrain: e.target.checked })}
              className="accent-yellow-400" />
            Respect grain direction
          </label>
        </div>
      </div>

      {/* Grain direction */}
      {panels.length > 0 && (
        <div className="panel-section">
          <span className="section-label">Grain Direction</span>

          {/* Snap mode */}
          <div className="flex gap-1 mb-3">
            {snapOptions.map(s => (
              <button key={s}
                onClick={() => setSnapMode(s)}
                className={`flex-1 py-1 text-[9px] tracking-wider border transition-all
                  ${snapMode === s ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-accent/40'}`}>
                {s === 'free' ? 'FREE' : `${s}°`}
              </button>
            ))}
          </div>

          {/* Per-panel grain */}
          <div className="flex flex-col gap-2 max-h-44 overflow-y-auto">
            {panels.map(panel => {
              const angle = grainAngles.get(panel.id) ?? 0;
              return (
                <div key={panel.id} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: panel.color }} />
                  <span className="text-[9px] text-muted flex-1 truncate">{panel.label}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setGrainAngle(panel.id, angle - (snapMode === 'free' ? 15 : snapMode === '45' ? 45 : 90))}
                      className="w-5 h-5 border border-border text-muted text-[10px] hover:border-accent hover:text-accent transition-all">‹</button>
                    <span className="text-[10px] text-accent w-8 text-center">{angle}°</span>
                    <button onClick={() => setGrainAngle(panel.id, angle + (snapMode === 'free' ? 15 : snapMode === '45' ? 45 : 90))}
                      className="w-5 h-5 border border-border text-muted text-[10px] hover:border-accent hover:text-accent transition-all">›</button>
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={resetAll} className="mt-2 text-[9px] text-muted/50 hover:text-muted underline">
            Reset all grain angles
          </button>
        </div>
      )}

      {/* Run nesting */}
      <div>
        <button
          onClick={handleNest}
          disabled={!layout || isProcessing}
          className={`btn-accent w-full text-center ${(!layout || isProcessing) ? 'opacity-30 cursor-not-allowed' : ''}`}
        >
          {isProcessing ? '⟳ NESTING…' : '⬡ RUN NESTING OPTIMIZER'}
        </button>
        {!layout && (
          <p className="text-[9px] text-muted/60 mt-1.5 leading-relaxed">
            Split mesh into panels first in the Panels tab.
          </p>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="panel-section">
          <span className="section-label">Result</span>
          <div className="flex flex-col gap-1 text-[11px]">
            {[
              ['Placed', `${result.items.length} / ${result.items.length + result.unplaced.length}`],
              ['Efficiency', `${(result.efficiency * 100).toFixed(1)}%`],
              ['Used area', `${(result.usedArea / 1000).toFixed(0)} cm²`],
              ['Waste', `${((1 - result.efficiency) * 100).toFixed(1)}%`],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between border-b border-border pb-1">
                <span className="text-muted">{k}</span>
                <span style={{ color: k === 'Efficiency' ? effColor : undefined }}
                  className={k !== 'Efficiency' ? 'text-accent' : ''}>
                  {v}
                </span>
              </div>
            ))}
          </div>

          {/* Efficiency bar */}
          <div className="mt-2 h-2 bg-border rounded overflow-hidden">
            <div className="h-full transition-all duration-500"
              style={{ width: `${result.efficiency * 100}%`, background: effColor }} />
          </div>

          {result.unplaced.length > 0 && (
            <div className="mt-2 text-[9px] text-danger/80 border border-danger/20 rounded p-2">
              ⚠ {result.unplaced.length} panel(s) too large for sheet. Increase sheet size or reduce panels.
            </div>
          )}
        </div>
      )}

      {/* Tips */}
      <div className="border border-border/50 rounded p-3 text-[9px] text-muted/60 leading-relaxed">
        <div className="text-muted/80 font-bold mb-1 tracking-wider">OPTIMIZER INFO</div>
        <div>• Bottom-Left-Fill algorithm</div>
        <div>• Tries 0° then 90° rotation per panel</div>
        <div>• Grain lock disables rotation</div>
        <div>• Panels sorted largest-first for best fit</div>
        <div>• Seam allowance added per panel</div>
      </div>
    </div>
  );
}
