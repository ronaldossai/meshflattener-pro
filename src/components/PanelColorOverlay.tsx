import { useMemo } from 'react';
import * as THREE from 'three';
import { usePanelStore } from '../store/usePanelStore';

export default function PanelColorOverlay() {
  const { layout, selectedPanelId } = usePanelStore();

  const panelMeshes = useMemo(() => {
    if (!layout) return [];
    return layout.panels.map(panel => {
      const geo = panel.geometry.clone();
      const hex = panel.color.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const color = new THREE.Color(r, g, b);
      const isSelected = panel.id === selectedPanelId;
      return { id: panel.id, geo, color, isSelected };
    });
  }, [layout, selectedPanelId]);

  if (!panelMeshes.length) return null;

  return (
    <group>
      {panelMeshes.map(({ id, geo, color, isSelected }) => (
        <mesh key={id} geometry={geo} renderOrder={1}>
          <meshStandardMaterial
            color={color}
            metalness={0.05}
            roughness={0.7}
            side={THREE.DoubleSide}
            opacity={isSelected ? 0.95 : 0.75}
            transparent={!isSelected}
            emissive={color}
            emissiveIntensity={isSelected ? 0.15 : 0.05}
          />
        </mesh>
      ))}
    </group>
  );
}
