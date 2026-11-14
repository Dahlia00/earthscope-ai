'use client';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import EarthScene from '@/components/landing/EarthScene';
import { geoToCartesian } from '@/lib/detective';
import type { Hotspot } from '@/lib/types';

function MarkerAnchor({
  hotspot,
  selected,
  focus,
  focusVersion,
  markerElements,
}: {
  hotspot: Hotspot;
  selected: boolean;
  focus: boolean;
  focusVersion: number;
  markerElements: RefObject<Map<number, HTMLButtonElement>>;
}) {
  const anchor = useRef<Group>(null);
  const { camera, invalidate } = useThree();
  const vectors = useMemo(
    () => ({ world: new Vector3(), projected: new Vector3(), view: new Vector3() }),
    [],
  );
  useEffect(() => {
    if (!focus || !selected || !anchor.current) return;
    anchor.current.updateWorldMatrix(true, false);
    const target = anchor.current.getWorldPosition(new Vector3());
    camera.position.copy(target.normalize().multiplyScalar(4.6));
    camera.lookAt(0, 0, 0);
    invalidate();
  }, [focus, focusVersion, selected, camera, invalidate]);
  useFrame(({ camera, size }) => {
    const element = markerElements.current.get(hotspot.rank);
    if (!anchor.current || !element) return;
    anchor.current.getWorldPosition(vectors.world);
    vectors.projected.copy(vectors.world).project(camera);
    vectors.view.copy(camera.position).sub(vectors.world);
    // The Earth is centred at the origin. Hide labels on the far hemisphere.
    const visible =
      vectors.world.dot(vectors.view) > 0 &&
      Math.abs(vectors.projected.x) <= 1 &&
      Math.abs(vectors.projected.y) <= 1 &&
      vectors.projected.z >= -1 &&
      vectors.projected.z <= 1;
    element.style.visibility = visible ? 'visible' : 'hidden';
    element.tabIndex = visible ? 0 : -1;
    element.style.transform = `translate(${((vectors.projected.x + 1) * size.width) / 2}px,${((1 - vectors.projected.y) * size.height) / 2}px) translate(-50%,-50%)`;
  });
  return <group ref={anchor} position={geoToCartesian(hotspot.centroid)} />;
}
export default function DetectiveScene({
  hotspots,
  selectedRank,
  focus,
  focusVersion,
  animated,
  onFailure,
  markerElements,
}: {
  hotspots: Hotspot[];
  selectedRank: number | null;
  focus: boolean;
  focusVersion: number;
  animated: boolean;
  onFailure: () => void;
  markerElements: RefObject<Map<number, HTMLButtonElement>>;
}) {
  return (
    <EarthScene animated={animated} onFailure={onFailure}>
      {hotspots.map((h) => (
        <MarkerAnchor
          key={h.rank}
          hotspot={h}
          selected={selectedRank === h.rank}
          focus={focus}
          focusVersion={focusVersion}
          markerElements={markerElements}
        />
      ))}
    </EarthScene>
  );
}
