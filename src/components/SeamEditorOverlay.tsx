import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMeshStore } from '../store/useMeshStore';
import { useSeamStore } from '../store/useSeamStore';
import {
  buildEdgeMap,
  seamEdgesToLines,
  findSeamPath,
  buildEdgePickMesh,
} from '../geometry/seamEditor';

// Invisible "fat edge" mesh for raycasting
function EdgePickLayer() {
  const { mesh } = useMeshStore();
  const { edgeMap, mode, pendingStart, startPath, completePath, setPreview, cancelDraw, seamPaths } = useSeamStore();
  const { camera, gl, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  raycaster.current.params.Line = { threshold: 0.04 };

  // Build point cloud for nearest-edge picking
  const { pickPoints, pickEdgeIds, pickGeometry } = useMemo(() => {
    if (!mesh || !edgeMap) return { pickPoints: [], pickEdgeIds: [], pickGeometry: null };
    const { points, edgeIds } = buildEdgePickMesh(edgeMap, mesh);
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(points.length * 3);
    points.forEach((p, i) => { arr[i*3]=p.x; arr[i*3+1]=p.y; arr[i*3+2]=p.z; });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return { pickPoints: points, pickEdgeIds: edgeIds, pickGeometry: geo };
  }, [mesh, edgeMap]);

  // Highlight geometry refs
  const seamLinesRef = useRef<THREE.Group>(null);
  const previewLineRef = useRef<THREE.LineSegments>(null);
  const hoverSphereRef = useRef<THREE.Mesh>(null);

  const getHoveredEdge = useCallback((clientX: number, clientY: number): string | null => {
    if (!mesh || !edgeMap || !pickPoints.length) return null;
    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.current.setFromCamera(mouse, camera);

    // Find closest edge midpoint to ray
    let closestDist = Infinity;
    let closestIdx = -1;
    pickPoints.forEach((pt, i) => {
      const d = raycaster.current.ray.distanceToPoint(pt);
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    });

    // Threshold relative to camera distance
    const camDist = camera.position.distanceTo(
      pickPoints[closestIdx] || new THREE.Vector3()
    );
    const threshold = camDist * 0.04;
    if (closestDist > threshold || closestIdx < 0) return null;
    return pickEdgeIds[closestIdx];
  }, [mesh, edgeMap, pickPoints, pickEdgeIds, camera, gl]);

  // Pointer move
  useEffect(() => {
    if (mode === 'view') return;
    const el = gl.domElement;

    const onMove = (e: MouseEvent) => {
      const hoveredId = getHoveredEdge(e.clientX, e.clientY);
      el.style.cursor = hoveredId ? (mode === 'draw' ? 'crosshair' : 'not-allowed') : 'default';

      if (mode === 'draw' && pendingStart && hoveredId && edgeMap) {
        const path = findSeamPath(pendingStart, hoveredId, edgeMap);
        setPreview(path);
      }

      // Move hover sphere
      if (hoverSphereRef.current && hoveredId && mesh) {
        const edge = edgeMap?.get(hoveredId);
        if (edge) {
          const pos = mesh.attributes.position;
          const mid = new THREE.Vector3(
            (pos.getX(edge.v0)+pos.getX(edge.v1))/2,
            (pos.getY(edge.v0)+pos.getY(edge.v1))/2,
            (pos.getZ(edge.v0)+pos.getZ(edge.v1))/2,
          );
          hoverSphereRef.current.position.copy(mid);
          hoverSphereRef.current.visible = true;
        }
      } else if (hoverSphereRef.current) {
        hoverSphereRef.current.visible = false;
      }
    };

    const onClick = (e: MouseEvent) => {
      if (mode !== 'draw') return;
      const hoveredId = getHoveredEdge(e.clientX, e.clientY);
      if (!hoveredId || !edgeMap) return;

      if (!pendingStart) {
        startPath(hoveredId);
      } else {
        const path = findSeamPath(pendingStart, hoveredId, edgeMap);
        completePath(hoveredId, path);
      }
    };

    const onRightClick = (e: MouseEvent) => {
      e.preventDefault();
      if (mode === 'draw') cancelDraw();
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('click', onClick);
    el.addEventListener('contextmenu', onRightClick);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('click', onClick);
      el.removeEventListener('contextmenu', onRightClick);
      el.style.cursor = 'default';
    };
  }, [mode, pendingStart, edgeMap, mesh, getHoveredEdge, startPath, completePath, setPreview, cancelDraw, gl]);

  // Cleanup cursor on mode change
  useEffect(() => {
    return () => { gl.domElement.style.cursor = 'default'; };
  }, [mode, gl]);

  return null;
}

// Visual seam lines overlay
export function SeamLinesOverlay() {
  const { mesh } = useMeshStore();
  const { seamPaths, pendingPreview, edgeMap, mode } = useSeamStore();

  const seamLineSegments = useMemo(() => {
    if (!mesh || !edgeMap) return [];
    return seamPaths.map(path => {
      const geo = seamEdgesToLines(path.edgeIds, edgeMap, mesh);
      return { id: path.id, geo, color: path.color };
    });
  }, [mesh, edgeMap, seamPaths]);

  const previewGeo = useMemo(() => {
    if (!mesh || !edgeMap || !pendingPreview.length) return null;
    return seamEdgesToLines(pendingPreview, edgeMap, mesh);
  }, [mesh, edgeMap, pendingPreview]);

  return (
    <group>
      {/* Committed seam paths */}
      {seamLineSegments.map(({ id, geo, color }) => (
        <lineSegments key={id} geometry={geo} renderOrder={1}>
          <lineBasicMaterial color={color} linewidth={3} depthTest={false} />
        </lineSegments>
      ))}

      {/* Preview path while drawing */}
      {previewGeo && mode === 'draw' && (
        <lineSegments geometry={previewGeo} renderOrder={2}>
          <lineBasicMaterial color="#ffffff" linewidth={2} depthTest={false} opacity={0.7} transparent />
        </lineSegments>
      )}

      {/* Hover indicator */}
      <mesh renderOrder={3} visible={false}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} />
      </mesh>
    </group>
  );
}

export default EdgePickLayer;
