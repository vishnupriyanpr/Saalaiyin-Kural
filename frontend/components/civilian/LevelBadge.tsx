"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getLevelForPoints, getNextLevelProgress, LevelTier } from "@/lib/gamification";
import { X, Award, Sparkles } from "lucide-react";

interface LevelBadgeProps {
  points: number;
  showProgress?: boolean;
}

export default function LevelBadge({ points, showProgress = true }: LevelBadgeProps) {
  const [currentTier, setCurrentTier] = useState<LevelTier>(getLevelForPoints(points));
  const [levelUpData, setLevelUpData] = useState<LevelTier | null>(null);
  const prevLevelRef = useRef<string>(getLevelForPoints(points).name);

  // Monitor points for level up
  useEffect(() => {
    const freshTier = getLevelForPoints(points);
    setCurrentTier(freshTier);

    if (prevLevelRef.current && prevLevelRef.current !== freshTier.name) {
      // Check if user went UP
      const prevTier = getLevelForPoints(points - 10); // estimate previous state
      const isUpgrade = freshTier.minPoints > prevTier.minPoints;
      
      if (isUpgrade) {
        setLevelUpData(freshTier);
      }
    }
    prevLevelRef.current = freshTier.name;
  }, [points]);

  const { nextTier, pointsToNext, progressPercent } = getNextLevelProgress(points);

  return (
    <div className="w-full">
      {/* Level Up Celebration Modal */}
      <AnimatePresence>
        {levelUpData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Screen Flash Overlay */}
            <motion.div
              initial={{ opacity: 1, backgroundColor: "#FF6B2C" }}
              animate={{ opacity: 0.95, backgroundColor: "#FF6B2C" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10"
            />
            {/* Dark Blur Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md z-20"
              onClick={() => setLevelUpData(null)}
            />

            {/* Celebration Modal Content */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.5, opacity: 0, y: 50 }}
              transition={{ type: "spring", damping: 15, stiffness: 100, delay: 0.1 }}
              className="relative w-11/12 max-w-md p-8 rounded-2xl glass border border-primary/30 text-center z-30 shadow-2xl flex flex-col items-center"
            >
              {/* Close Button */}
              <button 
                onClick={() => setLevelUpData(null)}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/50 flex items-center justify-center text-4xl mb-4 animate-bounce">
                {levelUpData.badge}
              </div>

              <div className="flex items-center space-x-1 justify-center text-amber-500 mb-2">
                <Sparkles className="w-5 h-5 animate-pulse" />
                <span className="font-bold text-xs uppercase tracking-widest font-mono">LEVEL UP</span>
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>

              <h2 className="text-3xl font-display font-extrabold mb-1 bg-gradient-to-r from-primary to-orange-500 bg-clip-text text-transparent">
                Congratulations!
              </h2>
              
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                You have advanced to the rank of:
              </p>

              <div className={`px-5 py-2.5 rounded-xl font-display font-bold text-xl inline-block mb-6 shadow-lg ${levelUpData.color} ${levelUpData.glowClass}`}>
                {levelUpData.badge} {levelUpData.name}
              </div>

              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                You have earned {points} total points. Keep reporting road damage in Tamil Nadu and unlocking eco-benefits!
              </p>

              <button
                onClick={() => setLevelUpData(null)}
                className="mt-6 w-full py-3 rounded-xl bg-gradient-to-r from-primary to-orange-500 hover:from-primary-hover hover:to-orange-600 text-white font-bold text-sm shadow-lg shadow-primary/20 transition duration-200"
              >
                Continue Reporting
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Badge Display */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between p-4 rounded-xl glass border border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-4 mb-4 md:mb-0">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl shadow-inner border border-slate-200 dark:border-slate-700">
            {currentTier.badge}
          </div>
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 dark:text-slate-500 leading-none mb-1">
              உறுப்பினர் நிலை (Current Level)
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-display font-black text-lg md:text-xl tracking-wide dark:text-white text-secondary">
                {currentTier.name}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${currentTier.color}`}>
                Active
              </span>
            </div>
          </div>
        </div>

        {showProgress && nextTier && (
          <div className="flex-1 md:max-w-xs md:ml-6 flex flex-col">
            <div className="flex justify-between items-center text-xs font-mono mb-1.5">
              <span className="text-slate-500 dark:text-slate-400">XP Progress</span>
              <span className="font-bold text-primary dark:text-orange-400">{points} / {nextTier.minPoints} XP</span>
            </div>
            {/* Progress Bar Container */}
            <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 overflow-hidden relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`h-full rounded-full bg-gradient-to-r from-primary to-yellow-500 ${currentTier.glowClass}`}
              />
            </div>
            <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center">
              <Award className="w-3.5 h-3.5 text-primary mr-1 animate-pulse" />
              <span>
                Need <strong className="font-semibold text-slate-700 dark:text-slate-300">{pointsToNext} more PTS</strong> to reach <strong className="font-bold text-primary dark:text-orange-400">{nextTier.name}</strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
