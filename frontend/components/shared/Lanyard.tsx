"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, extend, useFrame } from "@react-three/fiber";
import { useGLTF, useTexture, Environment, Lightformer, Html } from "@react-three/drei";
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from "@react-three/rapier";
import { MeshLineGeometry, MeshLineMaterial } from "meshline";
import * as THREE from "three";
import "./Lanyard.css";

const cardGLB = "/card.glb";
const lanyardImg = "/lanyard.png";

extend({ MeshLineGeometry, MeshLineMaterial });

export default function Lanyard({
  position = [0, 0, 20],
  gravity = [0, -40, 0],
  fov = 20,
  transparent = true,
  userData = { name: "Civilian", role: "Citizen" },
}: any) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="lanyard-wrapper w-full h-full">
      <Canvas
        camera={{ position: position as any, fov }}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{ alpha: transparent }}
        onCreated={({ gl }) => {
          if (!transparent) gl.setClearColor(new THREE.Color(0x000000), 1);
        }}
      >
        <ambientLight intensity={Math.PI} />
        <Physics gravity={gravity as any} timeStep={isMobile ? 1 / 30 : 1 / 60}>
          <Band isMobile={isMobile} userData={userData} />
        </Physics>
        <Environment blur={0.75}>
          <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={10} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
        </Environment>
      </Canvas>
    </div>
  );
}

function Band({ maxSpeed = 50, minSpeed = 0, isMobile = false, userData }: any) {
  const band = useRef<any>(null);
  const fixed = useRef<any>(null);
  const j1 = useRef<any>(null);
  const j2 = useRef<any>(null);
  const j3 = useRef<any>(null);
  const card = useRef<any>(null);

  const vec = new THREE.Vector3();
  const ang = new THREE.Vector3();
  const rot = new THREE.Vector3();
  const dir = new THREE.Vector3();

  const segmentProps = {
    type: "dynamic" as const,
    canSleep: true,
    colliders: false as const as any,
    angularDamping: 4,
    linearDamping: 4,
  };

  const { nodes, materials } = useGLTF(cardGLB) as any;
  const texture = useTexture(lanyardImg);

  const [curve] = useState(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ])
  );

  const [dragged, drag] = useState<any>(false);
  const [hovered, hover] = useState(false);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.5, 0]]);

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? "grabbing" : "grab";
      return () => void (document.body.style.cursor = "auto");
    }
  }, [hovered, dragged]);

  useFrame((state, delta) => {
    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      [card, j1, j2, j3, fixed].forEach((r) => r.current?.wakeUp());
      card.current?.setNextKinematicTranslation({
        x: vec.x - dragged.x,
        y: vec.y - dragged.y,
        z: vec.z - dragged.z,
      });
    }
    if (fixed.current) {
      [j1, j2].forEach((r) => {
        if (!r.current.lerped)
          r.current.lerped = new THREE.Vector3().copy(r.current.translation());
        const clampedDistance = Math.max(
          0.1,
          Math.min(1, r.current.lerped.distanceTo(r.current.translation()))
        );
        r.current.lerped.lerp(
          r.current.translation(),
          delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed))
        );
      });
      curve.points[0].copy(j3.current.translation());
      curve.points[1].copy(j2.current.lerped);
      curve.points[2].copy(j1.current.lerped);
      curve.points[3].copy(fixed.current.translation());
      band.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32));
      ang.copy(card.current.angvel());
      rot.copy(card.current.rotation());
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });
    }
  });

  (curve as any).curveType = "chordal";
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

  return (
    <>
      <group position={[0, 4, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.3, -0.5, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[0.2, -1.4, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[0, -1.3, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[0, -2.8, 0]} ref={card} {...segmentProps} type="fixed">
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group
            scale={2.25}
            position={[0, -1.2, -0.05]}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={(e) => (
              (e.target as any).releasePointerCapture(e.pointerId), drag(false)
            )}
            onPointerDown={(e) => (
              (e.target as any).setPointerCapture(e.pointerId),
              drag(
                new THREE.Vector3()
                  .copy(e.point)
                  .sub(vec.copy(card.current.translation()))
              )
            )}
          >
            {/* Card face — white/light surface */}
            <mesh geometry={nodes.card.geometry}>
              <meshPhysicalMaterial
                color="#ffffff"
                clearcoat={isMobile ? 0 : 1}
                clearcoatRoughness={0.1}
                roughness={0.8}
                metalness={0.05}
              />

              {/* 
                HTML is in the card MESH local space.
                [0, 0, 0] = card geometry center (by definition).
                We offset z by +0.06 to float just in front of the card face.
                scale is divided by group scale (2.25) to account for parent scaling.
              */}
              <Html
                transform
                center
                position={[0, 0, 0.06]}
                scale={0.115}
                zIndexRange={[100, 0]}
                style={{ pointerEvents: "none" }}
              >
                <div
                  style={{
                    width: 160,
                    height: 215,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "space-evenly",
                    padding: "12px 10px",
                    fontFamily: "'Inter', sans-serif",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                >
                  {/* Logo */}
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "#f1f5f9",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src="/tn-logo.png"
                      alt="TN Logo"
                      style={{ width: 36, height: 36, objectFit: "contain" }}
                    />
                  </div>

                  {/* Name */}
                  <div style={{ textAlign: "center" }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#0f172a",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        lineHeight: 1.2,
                        margin: 0,
                      }}
                    >
                      {userData.name}
                    </p>
                  </div>

                  {/* Role */}
                  <p
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      margin: 0,
                      textAlign: "center",
                    }}
                  >
                    {userData.role}
                  </p>

                  {/* Phone */}
                  {userData.phone && (
                    <p
                      style={{
                        fontSize: 9,
                        color: "#94a3b8",
                        fontFamily: "monospace",
                        margin: 0,
                      }}
                    >
                      {userData.phone}
                    </p>
                  )}

                  {/* Points */}
                  {userData.points !== undefined && (
                    <div
                      style={{
                        width: "100%",
                        background: "rgba(234,88,12,0.08)",
                        border: "1px solid rgba(234,88,12,0.25)",
                        borderRadius: 8,
                        padding: "4px 0",
                        textAlign: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#ea580c",
                          fontFamily: "monospace",
                        }}
                      >
                        {userData.points.toLocaleString()} PTS
                      </span>
                    </div>
                  )}

                  {/* Barcode */}
                  <svg
                    width="80"
                    height="20"
                    viewBox="0 0 100 30"
                    preserveAspectRatio="none"
                    style={{ opacity: 0.45 }}
                  >
                    <rect x="0" y="0" width="8" height="30" fill="#1e293b" />
                    <rect x="13" y="0" width="4" height="30" fill="#1e293b" />
                    <rect x="22" y="0" width="12" height="30" fill="#1e293b" />
                    <rect x="40" y="0" width="4" height="30" fill="#1e293b" />
                    <rect x="50" y="0" width="3" height="30" fill="#1e293b" />
                    <rect x="58" y="0" width="14" height="30" fill="#1e293b" />
                    <rect x="78" y="0" width="6" height="30" fill="#1e293b" />
                    <rect x="90" y="0" width="10" height="30" fill="#1e293b" />
                  </svg>
                </div>
              </Html>
            </mesh>

            {/* Metal clip + clamp */}
            <mesh geometry={nodes.clip.geometry} material={materials.metal} material-roughness={0.3} />
            <mesh geometry={nodes.clamp.geometry} material={materials.metal} />
          </group>
        </RigidBody>
      </group>

      {/* Lanyard band */}
      <mesh ref={band}>
        {/* @ts-ignore */}
        <meshLineGeometry />
        {/* @ts-ignore */}
        <meshLineMaterial
          color="white"
          depthTest={false}
          resolution={isMobile ? [1000, 2000] : [1000, 1000]}
          useMap
          map={texture}
          repeat={[-4, 1]}
          lineWidth={1}
        />
      </mesh>
    </>
  );
}
