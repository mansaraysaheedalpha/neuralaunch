// src/components/HeroBackground3D.tsx (New Component)
"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

function RotatingShape() {
  const meshRef = useRef<THREE.Mesh>(null!);
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.1;
      meshRef.current.rotation.y += delta * 0.15;
      // Simple mouse follow effect (adjust sensitivity)
      meshRef.current.position.x = THREE.MathUtils.lerp(
        meshRef.current.position.x,
        state.pointer.x * 1,
        0.05
      );
      meshRef.current.position.y = THREE.MathUtils.lerp(
        meshRef.current.position.y,
        state.pointer.y * 1,
        0.05
      );
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[2, 0]} /> {/* Example shape */}
      <meshStandardMaterial color="hsl(var(--primary))" wireframe={true} />
    </mesh>
  );
}

export default function HeroBackground3D() {
  return (
    <div className="absolute inset-0 -z-10 opacity-30">
      {" "}
      {/* Place behind content */}
      <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <RotatingShape />
      </Canvas>
    </div>
  );
}
