export interface LevelTier {
  name: string;
  minPoints: number;
  badge: string;
  color: string;
  glowClass: string;
}

export const LEVEL_TIERS: LevelTier[] = [
  { name: "Rookie", minPoints: 0, badge: "🌱", color: "text-slate-400 bg-slate-100 dark:bg-slate-800/80", glowClass: "" },
  { name: "Reporter", minPoints: 500, badge: "📢", color: "text-blue-500 bg-blue-50 dark:bg-blue-950/40 border border-blue-500/20", glowClass: "" },
  { name: "Watchdog", minPoints: 1500, badge: "🐕", color: "text-amber-500 bg-amber-50 dark:bg-amber-950/40 border border-amber-500/20", glowClass: "shadow-[0_0_10px_rgba(245,158,11,0.2)]" },
  { name: "Guardian", minPoints: 3000, badge: "🛡️", color: "text-success bg-success-light dark:bg-emerald-950/40 border border-success/20", glowClass: "glow-xp shadow-[0_0_15px_rgba(22,163,74,0.3)]" },
  { name: "Road Legend", minPoints: 6000, badge: "👑", color: "text-primary bg-primary-light dark:bg-orange-950/40 border border-primary/20", glowClass: "glow-xp shadow-[0_0_20px_rgba(255,107,44,0.5)] animate-pulse" },
];

export const POINT_EVENTS = {
  SUBMIT_COMPLAINT: 10,
  VERIFY_LOW: 100,
  VERIFY_MEDIUM: 150,
  VERIFY_HIGH: 180,
  VERIFY_CRITICAL: 250,
  NEW_ZONE_BONUS: 50,
  SEVEN_DAY_STREAK: 200,
  FAST_RESOLVE_BONUS: 50, // resolved in < 48 hours
  WORK_JOB_COMPLETED: 80,
  REFERRAL_BONUS: 100,
};

export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedColor: string;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: "First Report",
    title: "First Report",
    description: "Submitted your first road damage report",
    icon: "🌟",
    unlockedColor: "bg-blue-500 text-white",
  },
  {
    id: "Map Pioneer",
    title: "Map Pioneer",
    description: "First citizen to report an issue in a new postal zone",
    icon: "📍",
    unlockedColor: "bg-indigo-500 text-white",
  },
  {
    id: "7-Day Streak",
    title: "7-Day Streak",
    description: "Reported issues 7 days in a row",
    icon: "🔥",
    unlockedColor: "bg-orange-500 text-white",
  },
  {
    id: "Top Reporter",
    title: "Top Reporter",
    description: "Finished in the top 3 of your district leaderboard this month",
    icon: "🏆",
    unlockedColor: "bg-yellow-500 text-white",
  },
  {
    id: "Eco Hero",
    title: "Eco Hero",
    description: "Redeemed 500+ points for eco-friendly plants and seeds",
    icon: "🌳",
    unlockedColor: "bg-emerald-500 text-white",
  },
  {
    id: "Speed Spotter",
    title: "Speed Spotter",
    description: "Had a report verified by district admin in under 2 hours",
    icon: "⚡",
    unlockedColor: "bg-red-500 text-white",
  },
];

/**
 * Get the level tier based on point total
 */
export function getLevelForPoints(points: number): LevelTier {
  for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
    if (points >= LEVEL_TIERS[i].minPoints) {
      return LEVEL_TIERS[i];
    }
  }
  return LEVEL_TIERS[0];
}

/**
 * Get details for the next level tier (points needed, name, percentage progress)
 */
export function getNextLevelProgress(points: number): {
  currentTier: LevelTier;
  nextTier: LevelTier | null;
  pointsToNext: number;
  progressPercent: number;
} {
  const currentTier = getLevelForPoints(points);
  const currentIdx = LEVEL_TIERS.findIndex((t) => t.name === currentTier.name);
  
  if (currentIdx === LEVEL_TIERS.length - 1) {
    return {
      currentTier,
      nextTier: null,
      pointsToNext: 0,
      progressPercent: 100,
    };
  }

  const nextTier = LEVEL_TIERS[currentIdx + 1];
  const pointsInCurrentRange = points - currentTier.minPoints;
  const totalRange = nextTier.minPoints - currentTier.minPoints;
  const pointsToNext = nextTier.minPoints - points;
  const progressPercent = Math.min(
    Math.max((pointsInCurrentRange / totalRange) * 100, 0),
    100
  );

  return {
    currentTier,
    nextTier,
    pointsToNext,
    progressPercent,
  };
}

/**
 * Determine if a user qualifies for level-up after gaining points
 */
export function didLevelUp(prevPoints: number, newPoints: number): boolean {
  const prevLevel = getLevelForPoints(prevPoints);
  const newLevel = getLevelForPoints(newPoints);
  return prevLevel.name !== newLevel.name;
}
