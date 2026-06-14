"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";

interface PointCounterProps {
  value: number;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

export default function PointCounter({ value, className = "", size = "md" }: PointCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [pointDiff, setPointDiff] = useState<number | null>(null);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const diff = value - prevValueRef.current;
    if (diff > 0) {
      setPointDiff(diff);
      
      // Trigger gold/orange confetti burst!
      confetti({
        particleCount: Math.min(diff / 2 + 10, 80),
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#FF6B2C", "#1A3A5C", "#FFD700", "#16A34A"],
      });

      // Animate the numbers counting up
      let start = prevValueRef.current;
      const end = value;
      const duration = 1000; // 1s animation
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (easeOutQuad)
        const ease = progress * (2 - progress);
        const currentVal = Math.round(start + (end - start) * ease);
        
        setDisplayValue(currentVal);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setDisplayValue(end);
          setPointDiff(null);
        }
      };

      requestAnimationFrame(animate);
    } else {
      setDisplayValue(value);
    }
    prevValueRef.current = value;
  }, [value]);

  const sizeClasses = {
    sm: "text-lg font-bold",
    md: "text-2xl font-black md:text-3xl",
    lg: "text-4xl font-extrabold md:text-5xl",
    xl: "text-6xl font-black md:text-7xl",
  };

  return (
    <div className={`relative inline-flex items-center justify-center font-mono ${className}`}>
      {/* Floating Diff Tracker */}
      <AnimatePresence>
        {pointDiff !== null && (
          <motion.span
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: -25, scale: 1.2 }}
            exit={{ opacity: 0, y: -45 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute text-success font-bold text-sm md:text-base drop-shadow-[0_2px_4px_rgba(22,163,74,0.3)] bg-success-light dark:bg-emerald-950/80 px-2 py-0.5 rounded-full border border-success/20 pointer-events-none"
          >
            +{pointDiff} PTS!
          </motion.span>
        )}
      </AnimatePresence>

      <motion.div
        animate={pointDiff !== null ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 0.4 }}
        className="flex items-center space-x-1"
      >
        <span className="text-primary mr-1 animate-pulse">⭐</span>
        <span className={`${sizeClasses[size]} bg-clip-text text-transparent bg-gradient-to-r from-primary via-yellow-500 to-orange-600 drop-shadow-[0_2px_10px_rgba(255,107,44,0.15)]`}>
          {displayValue.toLocaleString()}
        </span>
      </motion.div>
    </div>
  );
}
