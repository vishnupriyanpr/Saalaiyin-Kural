"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Award, Filter, ShoppingBag, CheckCircle, Clock, X,
  ArrowRight, TreePine, Leaf, ShieldCheck, Heart, Sparkles
} from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { db } from "@/lib/db";
import { CivilianUser, RewardItem, RewardRedemption } from "@/lib/types";
import PointCounter from "@/components/civilian/PointCounter";
import { useRequireAuth, getStoredUser } from "@/lib/useAuth";

// Seeded reward icons are stored as Lucide icon names (e.g. "coffee", "shopping-bag");
// older rows may already hold an emoji. Map known names to an emoji; pass emojis through.
const REWARD_EMOJI: Record<string, string> = {
  coffee: "☕", film: "🎬", movie: "🎬", train: "🚆", metro: "🚆",
  "shopping-bag": "🛍️", bag: "🛍️", shirt: "👕", tshirt: "👕", gift: "🎁",
  tree: "🌳", pine: "🌳", sapling: "🌳", leaf: "🌿", rice: "🌾", grain: "🌾",
  recycle: "♻️", ticket: "🎟️", food: "🍱", heart: "❤️",
};
function rewardIcon(icon?: string): string {
  if (!icon) return "🎁";
  if (!/^[a-zA-Z-]+$/.test(icon)) return icon; // already an emoji / glyph
  return REWARD_EMOJI[icon.toLowerCase()] || "🎁";
}

export default function CivilianRewards() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<CivilianUser | null>(null);

  // Datasets
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filters
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Selection for redeem confirmation
  const [confirmItem, setConfirmItem] = useState<RewardItem | null>(null);
  const [successRedeemed, setSuccessRedeemed] = useState<RewardItem | null>(null);

  const fetchData = React.useCallback(async (uid: string) => {
    setLoading(true);
    setError(false);
    try {
      const [civ, rews, reds] = await Promise.all([
        db.getCivilianById(uid),
        db.getRewards(),
        db.getRedemptions(),
      ]);
      setUser(civ);
      setRewards(rews);
      setRedemptions(reds.filter(r => r.civilian_id === uid));
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

  const handleRedeemClick = (item: RewardItem) => {
    if (!user) return;
    if (user.points_total < item.points_cost) {
      alert("Insufficient points! Keep reporting road hazards to earn points.");
      return;
    }
    setConfirmItem(item);
  };

  const handleConfirmRedeem = async () => {
    if (!user || !confirmItem) return;

    try {
      // 1. Create redemption transaction
      await db.createRedemption({
        civilian_id: user.id,
        item_name: confirmItem.name,
        points_cost: confirmItem.points_cost,
        status: "pending" // starts as pending approval
      });

      // 2. Deduct points from Civilian User Profile
      await db.updateCivilian(user.id, {
        points_total: user.points_total - confirmItem.points_cost,
        points_redeemed: user.points_redeemed + confirmItem.points_cost
      });

      // 3. Notify Admin
      await db.createNotification({
        target_role: "admin",
        title: "New Redemption Request 🎁",
        body: `Citizen '${user.full_name}' requested redemption for '${confirmItem.name}' (${confirmItem.points_cost} PTS).`,
        type: "reward_approval"
      });

      // 4. Notify Civilian
      await db.createNotification({
        target_role: "civilian",
        target_id: user.id,
        title: "Redemption Submitted! 🎟️",
        body: `Your request for '${confirmItem.name}' is queued for admin approval. We will notify you once ready.`,
        type: "reward_approval"
      });

      setSuccessRedeemed(confirmItem);
      setConfirmItem(null);
      fetchData(user.id);
    } catch (err) {
      console.error(err);
      alert("Failed to complete redemption.");
    }
  };

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4">
        <Sparkles className="w-8 h-8 text-primary animate-pulse" />
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Loading rewards…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4 px-6 text-center">
        <X className="w-8 h-8 text-red-500" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Failed to load rewards.</p>
        <button onClick={() => session?.userId && fetchData(session.userId)} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md">Retry</button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Profile not found.</p>
      </div>
    );
  }

  // INNOVATION: Eco Impact Counter calculations
  // Sum up quantities from approved redemptions (guard against missing item_name)
  const approvedReds = redemptions.filter(r => r.status === "approved");
  const nameOf = (r: RewardRedemption) => String(r.item_name || "");
  const treesPlanted = approvedReds.filter(r => nameOf(r).includes("Sapling") || nameOf(r).includes("Seed")).length * 2 + 10; // default benchmark + earned
  const riceDistributed = approvedReds.filter(r => nameOf(r).includes("Rice") || nameOf(r).includes("Millet")).length * 5 + 5; // default kgs
  const plasticRecycled = approvedReds.filter(r => nameOf(r).includes("Bag") || nameOf(r).includes("Bin")).length * 1.5 + 4; // default kg equivalent

  const filteredRewards = (rewards || []).filter(item => {
    return activeCategory === "all" || item.category === activeCategory;
  });

  // Build the category filter from the actual reward catalog so every chip works.
  const categories = ["all", ...Array.from(new Set((rewards || []).map(r => r.category).filter(Boolean)))];
  const catLabel = (c: string) => (c === "all" ? "All Items" : c.charAt(0).toUpperCase() + c.slice(1));

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark text-slate-800 dark:text-slate-100 flex flex-col transition-colors pb-16">
      <Navbar portal="civilian" userId={user.id} userName={user.full_name} userPoints={user.points_total} />

      <main className="flex-1 max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl w-full mx-auto px-4 md:px-6 lg:px-8 mt-6 space-y-6">

        {/* Eco Impact Ticker */}
        <div className="p-5 md:p-6 rounded-2xl bg-gradient-to-r from-success to-emerald-800 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 glow-xp">
          <div className="absolute top-[-20%] right-[-10%] w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />

          <div className="space-y-1 min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-100 font-bold block">பசுமை தாக்கம் (Your Eco Impact)</span>
            <h2 className="text-xl md:text-2xl font-display font-black tracking-tight leading-tight">
              Sustainability Footprint
            </h2>
            <p className="text-xs text-emerald-100 mt-1 max-w-md">
              Converting civic duty rewards directly into environmental benefits for Tamil Nadu.
            </p>
          </div>

          {/* Impact Stats Grid */}
          <div className="grid grid-cols-3 gap-3 sm:gap-6 bg-black/10 border border-white/10 p-3 sm:p-4 rounded-xl text-center w-full md:w-auto shrink-0">
            <div className="space-y-1 min-w-0">
              <span className="text-lg md:text-xl">🌳</span>
              <strong className="block font-mono font-black text-xs sm:text-sm text-white">{treesPlanted} Trees</strong>
              <span className="text-[8.5px] text-emerald-200 block uppercase">Planted</span>
            </div>
            <div className="space-y-1 min-w-0">
              <span className="text-lg md:text-xl">🌾</span>
              <strong className="block font-mono font-black text-xs sm:text-sm text-white">{riceDistributed} Kg</strong>
              <span className="text-[8.5px] text-emerald-200 block uppercase">Rice/Grain</span>
            </div>
            <div className="space-y-1 min-w-0">
              <span className="text-lg md:text-xl">♻️</span>
              <strong className="block font-mono font-black text-xs sm:text-sm text-white">{plasticRecycled} Kg</strong>
              <span className="text-[8.5px] text-emerald-200 block uppercase">Recycled</span>
            </div>
          </div>
        </div>

        {/* Balance & Categories Filter */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-md">
          <div className="min-w-0">
            <span className="text-[9px] uppercase font-mono text-slate-400">உங்களிடம் உள்ள புள்ளிகள் (Balance)</span>
            <div className="flex items-center space-x-2 mt-0.5">
              <PointCounter value={user.points_total} size="md" />
            </div>
          </div>

          {/* Filter Categories */}
          <div className="flex w-full lg:w-auto overflow-x-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold uppercase whitespace-nowrap transition-all ${
                  activeCategory === cat
                    ? "bg-primary text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {catLabel(cat)}
              </button>
            ))}
          </div>
        </div>

        {/* Reward Store Catalog Grid */}
        {filteredRewards.length === 0 ? (
          <div className="p-10 rounded-2xl glass border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-success/10 border border-success/20 flex items-center justify-center text-2xl mx-auto">
              <Leaf className="w-6 h-6 text-success" />
            </div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No eco rewards in this category yet</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
              {activeCategory === "all"
                ? "The eco store catalog is being stocked. Check back soon to redeem your points!"
                : "Try a different category — new items are added regularly."}
            </p>
            {activeCategory !== "all" && (
              <button
                onClick={() => setActiveCategory("all")}
                className="mt-1 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-sm transition"
              >
                View all items
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {filteredRewards.map((item) => {
              const canAfford = user.points_total >= item.points_cost;
              return (
                <div
                  key={item.id}
                  className="p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-md flex flex-col justify-between gap-4 hover:border-slate-300 dark:hover:border-slate-700 transition"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-3xl shadow-inner">
                      {rewardIcon(item.icon)}
                    </div>
                    <div className="min-w-0">
                      <strong className="text-sm font-black block dark:text-slate-200 text-slate-700 leading-snug break-words">
                        {item.name}
                      </strong>
                      <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider break-words">
                        Stock: {item.stock} • Category: {item.category}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <span className="font-mono text-sm font-black text-primary">
                      {item.points_cost} PTS
                    </span>
                    <button
                      onClick={() => handleRedeemClick(item)}
                      disabled={!canAfford || item.stock <= 0}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold transition shadow-sm shrink-0 ${
                        canAfford && item.stock > 0
                          ? "bg-primary hover:bg-primary-hover text-white"
                          : "bg-slate-100 dark:bg-slate-900 text-slate-400 border border-slate-200 dark:border-slate-800 cursor-not-allowed"
                      }`}
                    >
                      {item.stock <= 0 ? "Out of stock" : "Redeem"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Redemption History Table */}
        <div className="p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg space-y-4">
          <div>
            <h3 className="font-display font-bold text-sm md:text-base mb-1">பரிசு வரலாறு (Redemption Ledger)</h3>
            <p className="text-xs text-slate-400">Historical records of redeemed eco benefits</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-mono text-slate-400 tracking-wider">
                  <th className="pb-3">Redeemed Item</th>
                  <th className="pb-3">Points Cost</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3 text-right">Approval Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {redemptions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-slate-400">No redemptions yet. Redeem your points for eco rewards!</td>
                  </tr>
                ) : (
                  redemptions.map((red) => {
                    const statusColors: Record<string, string> = {
                      pending: "text-warning bg-warning/10",
                      approved: "text-success bg-success/10",
                      rejected: "text-danger bg-danger/10"
                    };
                    const statusClass = statusColors[red.status] || "text-slate-500 bg-slate-100 dark:bg-slate-800";

                    return (
                      <tr key={red.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition">
                        <td className="py-3 pr-3 font-bold dark:text-slate-200 text-slate-700 break-words">
                          {red.item_name}
                        </td>
                        <td className="py-3 pr-3 font-mono font-bold text-primary whitespace-nowrap">
                          {red.points_cost} PTS
                        </td>
                        <td className="py-3 pr-3 font-mono text-slate-400 whitespace-nowrap">
                          {new Date(red.redeemed_at).toLocaleDateString("en-IN")}
                        </td>
                        <td className="py-3 text-right">
                          <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase whitespace-nowrap ${statusClass}`}>
                            {red.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setConfirmItem(null)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-[90%] max-w-sm max-h-[85vh] overflow-y-auto p-6 rounded-2xl glass border border-slate-200 dark:border-slate-800 text-center z-10 shadow-2xl"
            >
              <div className="text-3xl mb-3">{rewardIcon(confirmItem.icon)}</div>
              <h3 className="font-display font-extrabold text-base mb-1 dark:text-white text-secondary">Confirm Redemption</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                Are you sure you want to redeem <strong>{confirmItem.name}</strong> for <strong className="text-primary font-mono">{confirmItem.points_cost} PTS</strong>?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmItem(null)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRedeem}
                  className="flex-1 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-md transition"
                >
                  Confirm Redemption
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Success Modal */}
        {successRedeemed && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSuccessRedeemed(null)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-[90%] max-w-sm max-h-[85vh] overflow-y-auto p-6 rounded-2xl glass border border-success/30 text-center z-10 shadow-2xl flex flex-col items-center"
            >
              <div className="w-12 h-12 rounded-full bg-success/15 border border-success/30 flex items-center justify-center text-success mb-3 animate-bounce">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h3 className="font-display font-extrabold text-base mb-1 text-success">Redemption Queued!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                Your order ticket for <strong>{successRedeemed.name}</strong> has been submitted. Check your SMS or present your QR ticket at Coimbatore PWD Nursery once approved!
              </p>
              <button
                onClick={() => setSuccessRedeemed(null)}
                className="w-full py-2.5 rounded-xl bg-success hover:bg-success-hover text-white text-xs font-bold shadow-md transition"
              >
                Close Ticket
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
