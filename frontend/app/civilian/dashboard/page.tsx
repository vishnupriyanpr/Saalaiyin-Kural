"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useInView,
} from "framer-motion";
import {
  FileText, Award, RefreshCw, Flame, MapPin,
  CheckCircle, PlusCircle, ArrowRight, Trophy,
} from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import GlowButton from "@/components/shared/GlowButton";
import { db } from "@/lib/db";
import { CivilianUser, Complaint } from "@/lib/types";
import PointCounter from "@/components/civilian/PointCounter";
import LevelBadge from "@/components/civilian/LevelBadge";
import { BADGE_DEFINITIONS } from "@/lib/gamification";
import { useRequireAuth, getStoredUser } from "@/lib/useAuth";
import { useWebSocket } from "@/lib/useWebSocket";

/* ─── Animated number counter ────────────────────────────── */
function SpringCounter({ value, className = "" }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 70, damping: 20 });
  const inView = useInView(ref, { once: true });

  useEffect(() => { if (inView) mv.set(value); }, [inView, mv, value]);
  useEffect(() =>
    spring.on("change", (v) => { if (ref.current) ref.current.textContent = Math.round(v).toString(); }),
    [spring]
  );

  return <span ref={ref} className={className}>0</span>;
}

/* ─── Variants ───────────────────────────────────────────── */
const pageVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  show:   { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 200, damping: 22 } },
};
const listItemVariants = {
  hidden: { opacity: 0, x: 20 },
  show:   { opacity: 1, x: 0, transition: { type: "spring" as const, stiffness: 240, damping: 26 } },
};

/* ─── Status colour map ──────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  pending:     "text-slate-500 bg-slate-100",
  verified:    "text-blue-600 bg-blue-50",
  assigned:    "text-purple-600 bg-purple-50",
  in_progress: "text-amber-600 bg-amber-50",
  resolved:    "text-emerald-600 bg-emerald-50",
  rejected:    "text-red-600 bg-red-50",
};

export default function CivilianDashboard() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession]             = useState<any>(null);
  const [user, setUser]                   = useState<CivilianUser | null>(null);
  const [complaints, setComplaints]       = useState<Complaint[]>([]);
  const [districtRank, setDistrictRank]   = useState(0);
  const [districtCount, setDistrictCount] = useState(0);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(false);

  const fetchData = React.useCallback(async (uid: string) => {
    setLoading(true);
    setError(false);
    try {
      const civ = await db.getCivilianById(uid);
      if (civ) {
        setUser(civ);
        const all = await db.getCivilians();
        const sorted = all.filter(c => c.district === civ.district).sort((a, b) => b.points_total - a.points_total);
        setDistrictRank(Math.max(sorted.findIndex(c => c.id === civ.id) + 1, 1));
        setDistrictCount(sorted.length);
      }
      const comps = await db.getComplaints();
      setComplaints(comps.filter(c => c.civilian_id === uid));
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const parsed = getStoredUser();
    setSession(parsed);
    if (parsed?.userId) fetchData(parsed.userId);
    else setLoading(false);
  }, [ready, fetchData]);

  // Live: when a COMPLAINT_UPDATE arrives for one of our complaints, update its
  // status in place (no full refetch).
  const handleRealtime = React.useCallback((payload: any) => {
    if (payload?.type === "COMPLAINT_UPDATE" && payload.complaintId) {
      setComplaints((prev) =>
        prev.map((c) =>
          c.id === payload.complaintId ? { ...c, status: payload.status } : c
        )
      );
    }
  }, []);
  useWebSocket(handleRealtime);

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        >
          <RefreshCw className="w-8 h-8 text-primary" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-xs font-mono text-slate-400 uppercase tracking-widest"
        >
          Loading your dashboard…
        </motion.p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <RefreshCw className="w-8 h-8 text-red-500" />
        <p className="text-sm font-semibold text-slate-700">Failed to load your dashboard.</p>
        <button onClick={() => session?.userId && fetchData(session.userId)} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md">
          Retry
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm font-semibold text-slate-700">Profile not found.</p>
      </div>
    );
  }

  const totalSent     = complaints.length;
  const verifiedCount = complaints.filter(c => c.status !== "pending" && c.status !== "rejected").length;
  const resolvedCount = complaints.filter(c => c.status === "resolved").length;

  // Streak computed from the user's own report dates (consecutive days ending
  // today or yesterday) — self-heals even when the stored streak is stale.
  const dayKey = (d: Date) => d.toISOString().split("T")[0];
  const reportDays = new Set(complaints.map(c => dayKey(new Date(c.created_at))));
  let computedStreak = 0;
  {
    const cursor = new Date();
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    if (reportDays.has(dayKey(cursor)) || reportDays.has(dayKey(yest))) {
      if (!reportDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
      while (reportDays.has(dayKey(cursor))) { computedStreak++; cursor.setDate(cursor.getDate() - 1); }
    }
  }
  const streakDisplay = Math.max(user.streak_days || 0, computedStreak);

  // Derive unlocked badges from real signals, unioned with any server-awarded ones.
  const unlockedBadges = new Set<string>(Array.isArray(user.badges) ? user.badges : []);
  if (totalSent >= 1) unlockedBadges.add("First Report");
  if (streakDisplay >= 7) unlockedBadges.add("7-Day Streak");
  if (totalSent > 0 && districtRank > 0 && districtRank <= 3) unlockedBadges.add("Top Reporter");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col pb-16">
      <Navbar portal="civilian" userId={user.id} userName={user.full_name} userPoints={user.points_total} />

      <main className="flex-1 max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl w-full mx-auto px-4 md:px-6 lg:px-8 mt-6">
        <motion.div
          variants={pageVariants}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >

          {/* ── Welcome Hero ── */}
          <motion.div
            variants={cardVariants}
            whileHover={{ y: -2 }}
            className="p-6 rounded-2xl bg-gradient-to-br from-[#1A3A5C] via-[#0f2540] to-black border border-slate-800 text-white shadow-2xl relative overflow-hidden"
          >
            {/* Animated orb */}
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-[-40%] right-[-15%] w-64 h-64 rounded-full bg-primary/30 blur-3xl pointer-events-none"
            />
            <motion.div
              animate={{ x: [0, 15, 0], opacity: [0.1, 0.2, 0.1] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              className="absolute bottom-[-20%] left-[-10%] w-48 h-48 rounded-full bg-orange-500/20 blur-2xl pointer-events-none"
            />

            <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
              <div className="space-y-1">
                <motion.span
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block"
                >
                  குடிமக்கள் தளம் (Citizen Portal)
                </motion.span>
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                  className="text-2xl font-display font-black tracking-tight"
                >
                  வணக்கம், {user.full_name}!
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-xs text-slate-400 flex items-center"
                >
                  <MapPin className="w-3.5 h-3.5 mr-0.5 text-primary" />
                  District Contributor: <strong className="font-semibold ml-1 text-slate-300">{user.district}</strong>
                </motion.p>
              </div>

              {/* Points box */}
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35, type: "spring", stiffness: 240 }}
                className="bg-white/8 border border-white/10 px-5 py-3 rounded-2xl text-center backdrop-blur-sm"
              >
                <span className="text-[9px] uppercase font-mono tracking-wider text-slate-400 block mb-0.5">
                  சம்பாதித்த புள்ளிகள்
                </span>
                <PointCounter value={user.points_total} size="md" />
              </motion.div>
            </div>
          </motion.div>

          {/* ── Level Badge ── */}
          <motion.div variants={cardVariants}>
            <LevelBadge points={user.points_total} />
          </motion.div>

          {/* ── Stats Row ── */}
          <motion.div variants={cardVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Streak */}
            <motion.div
              whileHover={{ y: -4, boxShadow: "0 12px 30px rgba(255,107,44,0.1)" }}
              className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="w-10 h-10 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center"
                >
                  <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />
                </motion.div>
                <div>
                  <span className="text-[9.5px] uppercase font-mono text-slate-400 block">Daily Streak</span>
                  <strong className="text-sm font-extrabold text-slate-800">{streakDisplay} Days in a row</strong>
                </div>
              </div>
              <span className="text-2xl">🔥</span>
            </motion.div>

            {/* Rank */}
            <motion.div
              whileHover={{ y: -4, boxShadow: "0 12px 30px rgba(234,179,8,0.1)" }}
              className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <motion.div
                  animate={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                  className="w-10 h-10 rounded-full bg-yellow-50 border border-yellow-200 flex items-center justify-center"
                >
                  <Trophy className="w-5 h-5 text-yellow-500" />
                </motion.div>
                <div>
                  <span className="text-[9.5px] uppercase font-mono text-slate-400 block">District Rank</span>
                  <strong className="text-sm font-extrabold text-slate-800">Rank #{districtRank} of {districtCount}</strong>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-slate-400">COI</span>
            </motion.div>

            {/* Report CTA */}
            <motion.div
              onClick={() => router.push("/civilian/report")}
              whileHover={{ y: -4, boxShadow: "0 16px 36px rgba(255,107,44,0.25)" }}
              className="p-4 rounded-xl bg-primary cursor-pointer text-white flex items-center justify-between shadow-lg shadow-primary/20"
            >
              <div className="flex items-center space-x-3 text-left">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
                >
                  <PlusCircle className="w-5 h-5" />
                </motion.div>
                <div>
                  <strong className="text-xs font-bold block uppercase tracking-wider">Report Road Damage</strong>
                  <span className="text-[10px] text-white/70">Submit photos for AI triage</span>
                </div>
              </div>
              <GlowButton variant="ghost" size="xs" icon={<ArrowRight className="w-4 h-4" />}
                className="border-white/30 text-white hover:bg-white/10" magnetic={false}
                onClick={() => router.push("/civilian/report")}>
                Go
              </GlowButton>
            </motion.div>
          </motion.div>

          {/* ── Metric Counters ── */}
          <motion.div variants={cardVariants} className="grid grid-cols-3 gap-2 sm:gap-4">
            {[
              { label: "Reports Sent",     val: totalSent,     color: "text-slate-600" },
              { label: "Verified Cases",   val: verifiedCount, color: "text-blue-600"  },
              { label: "Resolved Repairs", val: resolvedCount, color: "text-emerald-600" },
            ].map((stat, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -3 }}
                className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm text-center"
              >
                <span className="text-[9.5px] uppercase font-mono text-slate-400 block mb-1">{stat.label}</span>
                <SpringCounter value={stat.val} className={`text-2xl font-black ${stat.color}`} />
              </motion.div>
            ))}
          </motion.div>

          {/* ── Achievement Badges ── */}
          <motion.div
            variants={cardVariants}
            className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4"
          >
            <div>
              <h3 className="font-display font-bold text-sm md:text-base mb-0.5">சாதனை பதக்கங்கள் (Achievement Badges)</h3>
              <p className="text-xs text-slate-400">Complete civic challenges to unlock badges and bonus points</p>
            </div>

            <motion.div
              variants={{ show: { transition: { staggerChildren: 0.07 } } }}
              initial="hidden"
              animate="show"
              className="flex flex-wrap gap-3"
            >
              {BADGE_DEFINITIONS.map((badge) => {
                const unlocked = unlockedBadges.has(badge.id);
                return (
                  <motion.div
                    key={badge.id}
                    variants={{ hidden: { opacity: 0, scale: 0.7 }, show: { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 300 } } }}
                    whileHover={unlocked ? { scale: 1.08, y: -3 } : { scale: 1.03 }}
                    title={badge.description}
                    className={`px-3 py-2 rounded-xl border flex items-center space-x-2 text-xs transition-all duration-200 ${
                      unlocked
                        ? "bg-white border-primary/25 shadow-sm"
                        : "bg-slate-50 border-slate-200 opacity-50 grayscale"
                    }`}
                  >
                    <span className="text-lg">{badge.icon}</span>
                    <div>
                      <strong className="font-bold block leading-none">{badge.title}</strong>
                      <span className={`text-[9px] mt-0.5 block ${unlocked ? "text-primary" : "text-slate-400"}`}>
                        {unlocked ? "✓ Unlocked" : "Locked"}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>

          {/* ── Recent Reports ── */}
          <motion.div
            variants={cardVariants}
            className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4"
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display font-bold text-sm md:text-base mb-0.5">உங்கள் புகார்கள் (Activity History)</h3>
                <p className="text-xs text-slate-400">Status logs of your submitted road defect reports</p>
              </div>
              <GlowButton variant="ghost" size="xs" onClick={() => router.push("/civilian/map")}
                icon={<ArrowRight className="w-3.5 h-3.5" />} magnetic={false}>
                Map View
              </GlowButton>
            </div>

            <div className="space-y-3">
              {complaints.length === 0 ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-slate-400 text-center py-6"
                >
                  No reports yet. Help keep Tamil Nadu safe!
                </motion.p>
              ) : (
                <motion.div
                  variants={{ show: { transition: { staggerChildren: 0.06 } } }}
                  initial="hidden"
                  animate="show"
                >
                  {complaints.map((comp) => (
                    <motion.div
                      key={comp.id}
                      variants={listItemVariants}
                      whileHover={{ x: 3, backgroundColor: "#f8fafc" }}
                      className="p-3.5 rounded-xl border border-slate-100 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center space-x-3 truncate">
                        {comp.photo_url && (
                          <motion.img
                            whileHover={{ scale: 1.1 }}
                            src={comp.photo_url}
                            alt="proof"
                            className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                        )}
                        <div className="truncate">
                          <strong className="text-xs font-bold block truncate text-slate-700">{comp.title}</strong>
                          <span className="text-[10px] text-slate-400 flex items-center mt-0.5 truncate">
                            <MapPin className="w-3 h-3 mr-0.5 text-primary" />
                            {comp.address}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${STATUS_COLORS[comp.status]}`}>
                          {comp.status}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400 block mt-1">
                          {new Date(comp.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          </motion.div>

        </motion.div>
      </main>
    </div>
  );
}
