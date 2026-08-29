"use client";
import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";
import type { ProjectVM } from "@/src/viewer/model";

export function Slab({
  project,
  position,
  active,
  onSelect,
}: {
  project: ProjectVM;
  position: [number, number, number];
  active: boolean;
  onSelect: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const scratch = useRef(new THREE.Vector3());

  useEffect(() => () => { document.body.style.cursor = "auto"; }, []);

  useFrame((_, dt) => {
    if (!group.current) return;
    const s = hover || active ? 1.04 : 1;
    group.current.scale.lerp(scratch.current.set(s, s, s), 1 - Math.pow(0.0001, dt));
  });

  const emissiveIntensity = active ? 0.28 : hover ? 0.16 : 0;
  const yaw = Math.atan2(position[0], position[2]);

  return (
    <group
      ref={group}
      position={position}
      rotation={[0, yaw, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "auto";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <RoundedBox args={[1.3, 2, 0.18]} radius={0.03} smoothness={4}>
        <meshStandardMaterial
          color="#2A2622"
          roughness={0.6}
          metalness={0.35}
          emissive="#C9A15E"
          emissiveIntensity={emissiveIntensity}
        />
      </RoundedBox>
      <Text position={[0, 0.2, 0.1]} fontSize={0.13} maxWidth={1.05} textAlign="center" anchorX="center" anchorY="middle" color="#E8E2D9">
        {project.name}
      </Text>
      <Text
        position={[0, -0.2, 0.1]}
        fontSize={0.075}
        maxWidth={1.05}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color="#8A8177"
      >
        {`${project.endpoints.length} ENDPOINTS / ${project.caseCount} CASES`}
      </Text>
      <mesh position={[-0.5, -0.82, 0.1]}>
        <planeGeometry args={[0.05, 0.05]} />
        <meshStandardMaterial color="#C9A15E" emissive="#C9A15E" emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
    </group>
  );
}
