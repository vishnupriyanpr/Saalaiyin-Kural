"use client";

import React, { useRef, useMemo, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Float, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";

// Rough fallback polygon for the Tamil Nadu silhouette (replaced by TnMapData if present).
const TN_FALLBACK = [
  [-1.5, 4.0], [0.5, 4.0], [3.0, 4.5], [3.2, 3.5], [2.5, 2.0], [3.8, 0.5],
  [3.0, -1.0], [2.2, -2.5], [1.0, -4.5], [-0.2, -3.0], [-1.5, -1.0],
  [-2.2, 1.0], [-1.8, 2.5], [-1.5, 4.0],
];

function TNMesh({ points, hovered, setHovered, reduce }: { points: number[][]; hovered: boolean; setHovered: (v: boolean) => void; reduce: boolean }) {
  // Extruded, centred geometry. Light bevel for a crafted terracotta edge.
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    if (points.length > 0) {
      shape.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
      shape.lineTo(points[0][0], points[0][1]);
    }
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.8, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.09, bevelThickness: 0.12, curveSegments: 8,
    });
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    if (box) {
      const c = new THREE.Vector3();
      box.getCenter(c);
      geo.translate(-c.x, -c.y, -c.z);
    }
    return geo;
  }, [points]);

  // Dispose geometry on swap to avoid GPU memory leaks.
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <Float speed={reduce ? 0 : 1.2} rotationIntensity={0} floatIntensity={reduce ? 0 : 0.6}>
      <mesh
        geometry={geometry}
        scale={hovered ? 1.04 : 1}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {/* Polished temple gold. Metalness needs reflections, supplied cheaply by a
            one-time Lightformer environment (rendered once, not per frame). */}
        <meshStandardMaterial
          color={hovered ? "#F4C24B" : "#E3A92E"}
          emissive="#2a1c00"
          emissiveIntensity={0.12}
          metalness={1}
          roughness={0.24}
          envMapIntensity={1.15}
        />
      </mesh>
    </Float>
  );
}

export default function TamilNadu3DMap() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);  // IntersectionObserver is the sole source of truth
  const [hovered, setHovered] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [points, setPoints] = useState<number[][]>(TN_FALLBACK);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    import("./TnMapData")
      .then((m) => { if ((m as any).TN_POINTS?.length) setPoints((m as any).TN_POINTS); })
      .catch(() => { /* keep fallback */ });
  }, []);

  // Freeze the WebGL render loop whenever the canvas is off-screen. This is the
  // single biggest performance win: zero GPU/CPU cost when you scroll away.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { threshold: 0.04 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="w-full h-full relative cursor-grab active:cursor-grabbing">
      <Canvas
        frameloop={active && !reduce ? "always" : "demand"}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 12], fov: 45 }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[6, 9, 10]} intensity={1.5} color="#fff3e6" />
        <directionalLight position={[-8, -5, 4]} intensity={0.5} color="#ffd9a0" />
        {/* Static (frames=1) studio environment → real gold sheen at ~zero per-frame cost */}
        <Environment resolution={128} frames={1}>
          <Lightformer intensity={2.4} position={[0, 4, 5]} scale={[9, 9, 1]} color="#fff3d6" />
          <Lightformer intensity={1.5} position={[-5, -1, 3]} scale={[6, 6, 1]} color="#ffd98a" />
          <Lightformer intensity={1.1} position={[5, 1, -4]} scale={[6, 6, 1]} color="#ffe9b0" />
        </Environment>
        <TNMesh points={points} hovered={hovered} setHovered={setHovered} reduce={reduce} />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableDamping={false}
          minPolarAngle={Math.PI / 2.5}
          maxPolarAngle={Math.PI / 1.5}
          autoRotate={active && !hovered && !reduce}
          autoRotateSpeed={0.55}
        />
      </Canvas>
    </div>
  );
}
