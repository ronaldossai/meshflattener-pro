import { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';

interface MeshObjectProps {
  geometry: THREE.BufferGeometry;
}

function MeshObject({ geometry }: MeshObjectProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (meshRef.current) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const center = new THREE.Vector3();
      box.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);
    }
  }, [geometry]);

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color="#5a7fa0"
        metalness={0.15}
        roughness={0.6}
        side={THREE.DoubleSide}
        wireframe={false}
      />
    </mesh>
  );
}

function WireframeObject({ geometry }: MeshObjectProps) {
  return (
    <lineSegments>
      <edgesGeometry args={[geometry]} />
      <lineBasicMaterial color="#e8c84a" opacity={0.25} transparent />
    </lineSegments>
  );
}

function CameraRig({ geometry }: { geometry: THREE.BufferGeometry | null }) {
  const mounted = useRef(false);
  useFrame(({ camera }) => {
    if (!mounted.current && geometry) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      camera.position.set(maxDim*1.5, maxDim*1.2, maxDim*1.5);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      mounted.current = true;
    }
  });
  return null;
}

interface STLViewerProps {
  geometry: THREE.BufferGeometry | null;
  showWireframe?: boolean;
}

export default function STLViewer({ geometry, showWireframe = false }: STLViewerProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [3, 3, 3], fov: 45, near: 0.01, far: 10000 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: '#0e0f11' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-5, -5, -5]} intensity={0.3} />
      <pointLight position={[0, 5, 0]} intensity={0.6} color="#e8c84a" />

      <Grid
        args={[50, 50]}
        cellSize={0.5}
        cellThickness={0.3}
        sectionSize={2}
        sectionThickness={0.8}
        sectionColor="#2a2d35"
        cellColor="#1a1c22"
        fadeDistance={30}
        fadeStrength={1}
        infiniteGrid
      />

      {geometry && (
        <>
          <MeshObject geometry={geometry} />
          {showWireframe && <WireframeObject geometry={geometry} />}
        </>
      )}

      {!geometry && (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#2a2d35" wireframe />
        </mesh>
      )}

      <CameraRig geometry={geometry} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={0.1}
        maxDistance={1000}
      />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport axisColors={['#e84a4a', '#4ecb71', '#4a7ae8']} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}
