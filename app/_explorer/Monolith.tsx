"use client";
import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { ProjectVM } from "@/src/viewer/model";
import { Slab } from "./Slab";

function ringPositions(count: number): [number, number, number][] {
  const radius = Math.max(2.4, count * 0.5);
  const out: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(count, 1)) * Math.PI * 2;
    out.push([Math.sin(a) * radius, 0, Math.cos(a) * radius]);
  }
  return out;
}

function CameraRig({
  activeIndex,
  positions,
}: {
  activeIndex: number;
  positions: [number, number, number][];
}) {
  const { camera } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.001, dt);
    const active = activeIndex >= 0 ? positions[activeIndex] : undefined;
    if (active) {
      desired.set(active[0] * 0.55, 0.6, active[2] * 0.55);
      lookAt.set(active[0], 0, active[2]);
    } else {
      desired.set(0, 1.5, 7);
      lookAt.set(0, 0, 0);
    }
    camera.position.lerp(desired, k);
    if (controls.current) {
      controls.current.target.lerp(lookAt, k);
      controls.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableZoom={false}
      autoRotate={activeIndex < 0}
      autoRotateSpeed={0.6}
      minPolarAngle={Math.PI / 3}
      maxPolarAngle={Math.PI / 1.8}
    />
  );
}

export default function Monolith({
  projects,
  activeSlug,
  onSelect,
}: {
  projects: ProjectVM[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  const positions = useMemo(() => ringPositions(projects.length), [projects.length]);
  const activeIndex = projects.findIndex((p) => p.slug === activeSlug);

  return (
    <Canvas dpr={[1, 1.75]} gl={{ antialias: true }} camera={{ position: [0, 1.5, 7], fov: 45 }}>
      <color attach="background" args={["#12100E"]} />
      <ambientLight color="#20263A" intensity={0.4} />
      <directionalLight color="#FFECD8" intensity={1.2} position={[3, 4, 5]} />
      <pointLight color="#FFECD8" intensity={0.3} position={[0, 2, -6]} />
      {projects.map((p, i) => (
        <Slab
          key={p.slug}
          project={p}
          position={positions[i]!}
          active={p.slug === activeSlug}
          onSelect={() => onSelect(p.slug)}
        />
      ))}
      <CameraRig activeIndex={activeIndex} positions={positions} />
    </Canvas>
  );
}
