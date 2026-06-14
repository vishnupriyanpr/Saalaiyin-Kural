"use client";

import React, { useRef, useState, useCallback } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

/* ─── Types ──────────────────────────────────────────────── */
interface Ripple { id: number; x: number; y: number }

type Variant = "primary" | "secondary" | "danger" | "ghost" | "gold" | "dark";
type Size    = "xs" | "sm" | "md" | "lg" | "xl";

interface GlowButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  disabled?: boolean;
  fullWidth?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
  id?: string;
  magnetic?: boolean;
}

/* ─── Variant configs ────────────────────────────────────── */
const VARIANTS: Record<Variant, {
  base: string;
  glow: string;
  shimmer: string;
  ring: string;
}> = {
  primary: {
    base:    "bg-gradient-to-r from-[#FF6B2C] to-[#F97316] text-white border-transparent",
    glow:    "rgba(255,107,44,0.55)",
    shimmer: "rgba(255,255,255,0.3)",
    ring:    "ring-orange-500/40",
  },
  secondary: {
    base:    "bg-white text-[#1A3A5C] border-2 border-[#1A3A5C]/30 hover:border-[#1A3A5C]",
    glow:    "rgba(26,58,92,0.3)",
    shimmer: "rgba(26,58,92,0.08)",
    ring:    "ring-slate-400/30",
  },
  danger: {
    base:    "bg-gradient-to-r from-red-600 to-rose-500 text-white border-transparent",
    glow:    "rgba(220,38,38,0.5)",
    shimmer: "rgba(255,255,255,0.25)",
    ring:    "ring-red-500/40",
  },
  ghost: {
    base:    "bg-transparent text-slate-600 border-2 border-slate-200 hover:border-slate-400",
    glow:    "rgba(100,116,139,0.2)",
    shimmer: "rgba(100,116,139,0.08)",
    ring:    "ring-slate-300/30",
  },
  gold: {
    base:    "bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-900 border-transparent",
    glow:    "rgba(217,119,6,0.55)",
    shimmer: "rgba(255,255,255,0.35)",
    ring:    "ring-amber-400/40",
  },
  dark: {
    base:    "bg-gradient-to-r from-[#1A3A5C] to-slate-900 text-white border-transparent",
    glow:    "rgba(26,58,92,0.5)",
    shimmer: "rgba(255,255,255,0.15)",
    ring:    "ring-slate-700/40",
  },
};

const SIZES: Record<Size, string> = {
  xs:  "px-3 py-1.5 text-[11px] rounded-lg gap-1.5",
  sm:  "px-4 py-2 text-xs rounded-xl gap-2",
  md:  "px-5 py-3 text-sm rounded-xl gap-2",
  lg:  "px-7 py-3.5 text-base rounded-2xl gap-2.5",
  xl:  "px-9 py-4 text-lg rounded-2xl gap-3",
};

/* ─── Component ──────────────────────────────────────────── */
export default function GlowButton({
  children,
  onClick,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "right",
  disabled = false,
  fullWidth = false,
  type = "button",
  className = "",
  id,
  magnetic = true,
}: GlowButtonProps) {
  const btnRef    = useRef<HTMLButtonElement>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [hovered, setHovered] = useState(false);

  /* Magnetic effect */
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 300, damping: 25 });
  const sy = useSpring(my, { stiffness: 300, damping: 25 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (!magnetic || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    mx.set((e.clientX - cx) * 0.22);
    my.set((e.clientY - cy) * 0.22);
  }, [magnetic, mx, my]);

  const handleMouseLeave = useCallback(() => {
    mx.set(0); my.set(0); setHovered(false);
  }, [mx, my]);

  /* Ripple effect */
  const addRipple = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const id   = Date.now();
    setRipples(r => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setRipples(r => r.filter(rr => rr.id !== id)), 700);
    onClick?.(e);
  }, [onClick]);

  const cfg  = VARIANTS[variant];
  const sz   = SIZES[size];

  return (
    <motion.button
      ref={btnRef}
      id={id}
      type={type}
      disabled={disabled}
      style={{ x: magnetic ? sx : 0, y: magnetic ? sy : 0 }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={addRipple}
      whileHover={disabled ? {} : {
        scale: 1.04,
        boxShadow: `0 8px 32px ${cfg.glow}, 0 2px 8px ${cfg.glow}`,
      }}
      whileTap={disabled ? {} : {
        scale: 0.96,
        boxShadow: `0 2px 8px ${cfg.glow}`,
      }}
      transition={{ type: "spring", stiffness: 400, damping: 24 }}
      className={[
        "relative overflow-hidden inline-flex items-center justify-center font-bold",
        "transition-colors duration-200 select-none outline-none",
        "focus-visible:ring-2 focus-visible:ring-offset-2", cfg.ring,
        cfg.base, sz,
        fullWidth ? "w-full" : "",
        disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : "cursor-pointer",
        className,
      ].join(" ")}
    >
      {/* ── Shimmer sweep ── */}
      <motion.span
        className="absolute inset-0 pointer-events-none"
        initial={{ x: "-100%" }}
        animate={hovered ? { x: "200%" } : { x: "-100%" }}
        transition={{ duration: 0.55, ease: "easeIn" }}
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${cfg.shimmer} 50%, transparent 100%)`,
        }}
      />

      {/* ── Glow border pulse when hovered ── */}
      {hovered && !disabled && (
        <motion.span
          className="absolute inset-0 rounded-[inherit] pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.7, 0] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          style={{ boxShadow: `0 0 0 2px ${cfg.glow}` }}
        />
      )}

      {/* ── Ripples ── */}
      {ripples.map(r => (
        <motion.span
          key={r.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: r.x, top: r.y,
            translateX: "-50%", translateY: "-50%",
            background: cfg.shimmer,
          }}
          initial={{ width: 0, height: 0, opacity: 0.8 }}
          animate={{ width: 260, height: 260, opacity: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
        />
      ))}

      {/* ── Content ── */}
      {icon && iconPosition === "left" && (
        <motion.span
          animate={hovered ? { scale: 1.2, rotate: -8 } : { scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 400 }}
          className="shrink-0"
        >
          {icon}
        </motion.span>
      )}

      <span className="relative z-10 leading-none">{children}</span>

      {icon && iconPosition === "right" && (
        <motion.span
          animate={hovered ? { x: 4, scale: 1.1 } : { x: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 400 }}
          className="shrink-0 relative z-10"
        >
          {icon}
        </motion.span>
      )}
    </motion.button>
  );
}
