"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";

/* 
  Animated Bird using SVG path morphing for the wing flap
  and simple translation for flying across the screen.
*/
function Bird({ delay, duration, top, scale, inverted = false }: { delay: number, duration: number, top: string, scale: number, inverted?: boolean }) {
  // Wings Up
  const pathUp = "M 10,40 Q 30,10 50,40 Q 70,10 90,40 Q 70,25 50,35 Q 30,25 10,40 Z";
  // Wings Down
  const pathDown = "M 10,40 Q 30,65 50,40 Q 70,65 90,40 Q 70,50 50,45 Q 30,50 10,40 Z";

  return (
    <motion.div
      className="absolute z-10 pointer-events-none opacity-60"
      initial={{ x: inverted ? "-10vw" : "110vw", y: top, scale }}
      animate={{ x: inverted ? "110vw" : "-10vw", y: `calc(${top} - 80px)` }}
      transition={{
        duration,
        repeat: Infinity,
        delay,
        ease: "linear",
      }}
      style={{ transform: inverted ? "scaleX(-1)" : "none" }}
    >
      <svg width="40" height="40" viewBox="0 0 100 100" className="drop-shadow-sm">
        <motion.path
          fill="#111"
          animate={{ d: [pathUp, pathDown, pathUp] }}
          transition={{
            duration: 0.6 + Math.random() * 0.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </svg>
    </motion.div>
  );
}

/* 
  Floating Dust / Sun motes to make the scene feel atmospheric
*/
function FloatingDust({ delay, left, top, size, duration }: any) {
  return (
    <motion.div
      className="absolute rounded-full bg-amber-400/20 blur-[1px] pointer-events-none"
      style={{ left, top, width: size, height: size }}
      animate={{
        y: [0, -40, 0],
        x: [0, 20, 0],
        opacity: [0, 0.6, 0],
        scale: [1, 1.5, 1],
      }}
      transition={{
        duration,
        repeat: Infinity,
        delay,
        ease: "easeInOut",
      }}
    />
  );
}

export default function LiveBackground() {
  // Generate random values once to prevent hydration mismatch
  const dustMotes = useMemo(() => {
    return Array.from({ length: 15 }).map((_, i) => ({
      id: i,
      delay: Math.random() * 5,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() * 6 + 2,
      duration: Math.random() * 10 + 10,
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* ── Floating Dust Particles ── */}
      {dustMotes.map((mote) => (
        <FloatingDust key={`dust-${mote.id}`} {...mote} />
      ))}

      {/* ── Flock of Birds ── */}
      {/* Main flock moving right to left */}
      <Bird delay={0} duration={35} top="30%" scale={0.4} />
      <Bird delay={1.2} duration={38} top="28%" scale={0.3} />
      <Bird delay={2.5} duration={40} top="33%" scale={0.25} />
      <Bird delay={0.8} duration={36} top="31%" scale={0.35} />
      
      {/* High altitude slow flock */}
      <Bird delay={12} duration={50} top="15%" scale={0.2} />
      <Bird delay={13} duration={52} top="14%" scale={0.15} />
      <Bird delay={14.5} duration={55} top="16%" scale={0.18} />

      {/* Occasional bird moving left to right */}
      <Bird delay={8} duration={25} top="45%" scale={0.5} inverted />
      <Bird delay={22} duration={28} top="25%" scale={0.4} inverted />

      {/* ── Sun Rays Overlay (Subtle) ── */}
      <motion.div 
        className="absolute inset-0 origin-top-left pointer-events-none opacity-20 mix-blend-screen"
        style={{
          background: "linear-gradient(135deg, rgba(255,180,50,0.4) 0%, transparent 60%)"
        }}
        animate={{ opacity: [0.15, 0.25, 0.15] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
