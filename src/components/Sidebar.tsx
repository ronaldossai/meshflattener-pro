import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { useMeshStore } from '../store/useMeshStore';
import { useSeamStore } from '../store/useSeamStore';
import { usePanelStore } from '../store/usePanelStore';
import { useNestingStore } from '../store/useNestingStore';
import { useGrainStore } from '../store/useGrainStore';
import { computeStats, flattenGeometry, makeCushionGeometry, makeSaddleGeometry, makeCylinderGeometry } from '../geometry/flattenEngine';
import { buildEdgeMap } from '../geometry/seamEditor';
import { exportSVG, exportDXF } from '../exporters/exportUtils';
import { generatePDF, downloadPDF } from '../exporters/pdfExporter';
import SeamPanel from './SeamPanel';
import PanelManagerPanel from './PanelManagerPanel';
import NestingPanel from './NestingPanel';

export default function Sidebar() {
  const {
    mesh, fileName, stats, flatResult, seamAllowance, algorithm, activePanel,
    setMesh, setFlatResult, setSeamAllowance, setAlgorithm, setProcessing, isProcessing, setActivePanel
  } = useMeshStore();
  const { layout } = usePanelStore();
  const { result: nestingResult } = useNestingStore();

  const processGeometry = useCallback((geo: THREE.BufferGeometry, name: string) => {
    setProcessing(true);
    setTimeout(() => {
      try {
        geo.computeVertexNormals();
        const s = computeStats(geo);
        setMesh(geo, name, s);
        const result = flattenGeometry(geo, algorithm);
        setFlatResult(result);

        // New mesh invalidates any prior seam/panel/nesting/grain state
        const edgeMap = buildEdgeMap(geo);
        useSeamStore.setState({ edgeMap, seamPaths: [], pendingStart: null, pendingPreview: [], mode: 'view' });
        usePanelStore.setState({ layout: null, selectedPanelId: null });
        useNestingStore.setState({ result: null });
        useGrainStore.setState({ grainAngles: new Map() });
      } finally {
        setProcessing(false);
      }
    }, 30);
  }, [algorithm, setMesh, setFlatResult, setProcessing]);

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const loader = new STLLoader();
      const geo = loader.parse(e.target!.result as ArrayBuffer);
      processGeometry(geo, file.name);
    };
    reader.readAsArrayBuffer(file);
  }, [processGeometry]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/octet-stream': ['.stl'] }, multiple: false
  });

  const loadDemo = useCallback((type: string) => {
    let geo: THREE.BufferGeometry;
    if (type === 'cushion') geo = makeCushionGeometry();
    else if (type === 'saddle') geo = makeSaddleGeometry();
    else geo = makeCylinderGeometry();
    processGeometry(geo, `demo-${type}.stl`);
  }, [processGeometry]);

  const handleExportSVG = () => {
    if (!flatResult || !mesh) return;
    const { flat2d, distortion } = flatResult;
    const { verts: _, faces } = (() => {
      const pos = mesh.attributes.position;
      const idx = mesh.index;
      const faces: number[][] = [];
      if (idx) { for(let i=0;i<idx.count;i+=3) faces.push([idx.getX(i),idx.getX(i+1),idx.getX(i+2)]); }
      else { for(let i=0;i<pos.count;i+=3) faces.push([i,i+1,i+2]); }
      return { verts: [], faces };
    })();
    const svg = exportSVG(flat2d, faces, distortion, seamAllowance, fileName);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='pattern.svg'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDXF = () => {
    if (!flatResult || !mesh) return;
    const { flat2d } = flatResult;
    const pos = mesh.attributes.position, idx = mesh.index;
    const faces: number[][] = [];
    if (idx) { for(let i=0;i<idx.count;i+=3) faces.push([idx.getX(i),idx.getX(i+1),idx.getX(i+2)]); }
    else { for(let i=0;i<pos.count;i+=3) faces.push([i,i+1,i+2]); }
    const dxf = exportDXF(flat2d, faces, seamAllowance);
    const blob = new Blob([dxf], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='pattern.dxf'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (!layout) return;
    const pdf = generatePDF(layout.panels, seamAllowance, nestingResult ?? undefined);
    if (pdf) downloadPDF(pdf, `${fileName.replace(/\.[^.]+$/, '') || 'patterns'}.pdf`);
  };

  const SectionLabel = ({ text }: { text: string }) => (
    <span className="section-label">{text}</span>
  );

  return (
    <aside className="w-64 min-w-[220px] bg-panel border-r border-border flex flex-col overflow-y-auto">
      <div className="p-4 flex flex-col gap-5">

        {/* Drop zone */}
        <div className="panel-section">
          <SectionLabel text="Input" />
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded p-4 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-accent text-accent' : 'border-border text-muted hover:border-accent/50'}`}
          >
            <input {...getInputProps()} />
            <div className="text-2xl mb-1">⬡</div>
            <div className="text-[10px] tracking-wider">
              {isDragActive ? 'DROP STL HERE' : 'DRAG & DROP STL'}
            </div>
            <div className="text-[9px] mt-1 text-muted/60">or click to browse</div>
          </div>
          {fileName && (
            <div className="text-[9px] text-muted mt-2 truncate" title={fileName}>
              ↳ {fileName}
            </div>
          )}
        </div>

        {/* Demo meshes */}
        <div className="panel-section">
          <SectionLabel text="Demo Meshes" />
          <div className="flex flex-col gap-1.5">
            {['cushion','saddle','cylinder'].map(t=>(
              <button key={t} className="btn-muted text-left" onClick={()=>loadDemo(t)}>
                ▶ {t.charAt(0).toUpperCase()+t.slice(1)} {t==='cushion'?'Seat':t==='saddle'?'Surface':'Panel'}
              </button>
            ))}
          </div>
        </div>

        {/* Algorithm */}
        <div className="panel-section">
          <SectionLabel text="Algorithm" />
          <div className="flex flex-col gap-1.5">
            {(['ARAP','LSCM','Projection'] as const).map(a=>(
              <button key={a}
                className={`text-left px-3 py-1.5 text-xs border rounded tracking-wider transition-all
                  ${algorithm===a ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent/50'}`}
                onClick={()=>setAlgorithm(a)}
              >
                {algorithm===a?'● ':''}{a}
              </button>
            ))}
            <p className="text-[9px] text-muted/70 mt-1">
              {algorithm==='ARAP'&&'Least stretch — best for fabric'}
              {algorithm==='LSCM'&&'Angle-preserving conformal map'}
              {algorithm==='Projection'&&'Fast planar projection'}
            </p>
          </div>
        </div>

        {/* Seam allowance */}
        <div className="panel-section">
          <SectionLabel text="Seam Allowance (mm)" />
          <input
            type="number" min={0} max={50} value={seamAllowance}
            onChange={e=>setSeamAllowance(Number(e.target.value))}
            className="w-full bg-[#1e2330] border border-border text-accent px-3 py-1.5 text-xs outline-none focus:border-accent rounded"
          />
        </div>

        {/* Stats */}
        {stats && (
          <div className="panel-section">
            <SectionLabel text="Mesh Info" />
            <div className="flex flex-col gap-1 text-[11px]">
              {[
                ['Vertices', stats.vertices.toLocaleString()],
                ['Faces', stats.faces.toLocaleString()],
                ['Surface Area', stats.surfaceArea.toFixed(2)],
              ].map(([k,v])=>(
                <div key={k} className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted">{k}</span>
                  <span className="text-accent">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stage-specific tools */}
        {mesh && activePanel === '3d' && (
          <div className="panel-section">
            <SectionLabel text="Seam Editor" />
            <SeamPanel onReflatten={() => setActivePanel('flat')} />
          </div>
        )}

        {mesh && activePanel === 'panels' && (
          <div className="panel-section">
            <SectionLabel text="Panel Manager" />
            <PanelManagerPanel />
          </div>
        )}

        {mesh && activePanel === 'nesting' && (
          <div className="panel-section">
            <SectionLabel text="Nesting & Layout" />
            <NestingPanel />
          </div>
        )}

        {/* Export */}
        {flatResult && (activePanel === 'flat' || activePanel === 'distortion') && (
          <div>
            <SectionLabel text="Export" />
            <div className="flex flex-col gap-1.5">
              <button className="btn-accent" onClick={handleExportSVG}>↓ SVG Pattern</button>
              <button className="btn-accent" onClick={handleExportDXF}>↓ DXF (CNC)</button>
            </div>
          </div>
        )}

        {activePanel === 'nesting' && layout && (
          <div>
            <SectionLabel text="Pattern Export" />
            <button className="btn-accent w-full text-center" onClick={handleExportPDF}>
              ↓ Export Pattern Set (PDF)
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="text-center text-accent text-[11px] animate-pulse tracking-widest">
            ⟳ PROCESSING…
          </div>
        )}
      </div>
    </aside>
  );
}
