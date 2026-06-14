"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Award, TrendingUp, Check, X, Tag, Plus, Edit3, 
  Trash2, RefreshCw, Sparkles, Zap, Percent, ShieldCheck
} from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { db } from "@/lib/db";
import { RewardItem, RewardRedemption, CivilianUser } from "@/lib/types";
import { useRequireAuth, getStoredUser } from "@/lib/useAuth";

export default function AdminRewards() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession] = useState<any>(null);

  // Datasets
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [civilians, setCivilians] = useState<CivilianUser[]>([]);
  const [multipliers, setMultipliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Form states
  const [newItem, setNewItem] = useState({
    name: "",
    icon: "🌳",
    pointsCost: 100,
    category: "eco" as "plant" | "food" | "eco",
    stock: 50
  });

  const [newMultiplier, setNewMultiplier] = useState({
    district: "Coimbatore",
    multiplier: 2,
    startDate: "",
    endDate: ""
  });

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // allSettled so one failing endpoint doesn't blank the whole console —
      // each panel renders whatever data it could load.
      const [rewsR, redsR, civsR, multsR] = await Promise.allSettled([
        db.getRewards(),
        db.getRedemptions(),
        db.getCivilians(),
        db.getMultiplierEvents(),
      ]);
      setRewards(rewsR.status === "fulfilled" ? rewsR.value : []);
      setRedemptions(redsR.status === "fulfilled" ? redsR.value : []);
      setCivilians(civsR.status === "fulfilled" ? civsR.value : []);
      setMultipliers(multsR.status === "fulfilled" ? multsR.value : []);
      if ([rewsR, redsR, civsR, multsR].every((r) => r.status === "rejected")) setError(true);
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
    if (parsed?.role !== "admin") { router.replace("/login"); return; }
    setSession(parsed);
    fetchData();
  }, [ready, fetchData, router]);

  // Actions
  const handleApproveRedemption = async (redId: string) => {
    try {
      const red = redemptions.find(r => r.id === redId);
      if (!red) return;

      // 1. Update redemption status to approved
      await db.updateRedemption(redId, { status: "approved" });

      // 2. Decrement stock on reward item
      const item = rewards.find(r => r.name === red.item_name);
      if (item) {
        await db.updateReward(item.id, { stock: Math.max(item.stock - 1, 0) });
      }

      // 3. Create Notification for civilian
      await db.createNotification({
        target_role: "civilian",
        target_id: red.civilian_id,
        title: "Eco Reward Approved! 🌳",
        body: `Your redemption request for '${red.item_name}' was verified by the admin team. Present your QR ticket to pick it up!`,
        type: "reward_approval"
      });

      alert("Redemption request approved!");
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectRedemption = async (redId: string) => {
    try {
      const red = redemptions.find(r => r.id === redId);
      if (!red) return;

      // 1. Update status
      await db.updateRedemption(redId, { status: "rejected" });

      // 2. Return points back to Civilian profile
      const civilian = civilians.find(c => c.id === red.civilian_id);
      if (civilian) {
        await db.updateCivilian(civilian.id, {
          points_total: civilian.points_total + red.points_cost,
        });
      }

      // 3. Notify civilian
      await db.createNotification({
        target_role: "civilian",
        target_id: red.civilian_id,
        title: "Redemption Cancelled",
        body: `Your request for '${red.item_name}' was rejected. Points refunded back to balance.`,
        type: "reward_approval"
      });

      alert("Redemption request rejected. Points refunded.");
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateRewardItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name) return;

    try {
      await db.createRewardItem({
        name: newItem.name,
        icon: newItem.icon,
        points_cost: newItem.pointsCost,
        category: newItem.category,
        stock: newItem.stock,
        active: true
      });

      setNewItem({
        name: "",
        icon: "🌳",
        pointsCost: 100,
        category: "eco",
        stock: 50
      });
      alert("Eco Item created in Catalog.");
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateMultiplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMultiplier.startDate || !newMultiplier.endDate) {
      alert("Please select date ranges.");
      return;
    }

    try {
      await db.createMultiplierEvent(
        newMultiplier.district,
        newMultiplier.multiplier,
        newMultiplier.startDate,
        newMultiplier.endDate
      );

      // Create Admin notification
      await db.createNotification({
        target_role: "admin",
        title: "Point Multiplier Activated! ⚡",
        body: `Active: ${newMultiplier.multiplier}x points enabled for ${newMultiplier.district} between ${newMultiplier.startDate} and ${newMultiplier.endDate}.`,
        type: "cluster_alert"
      });

      // Create broadcast to all civilians in Coimbatore/Chennai
      await db.createNotification({
        target_role: "all",
        target_id: null,
        title: `Point Booster Event in ${newMultiplier.district}! 🔥`,
        body: `Monsoon Pre-Alert: All road damage reports verified in ${newMultiplier.district} earn ${newMultiplier.multiplier}x points! Help clear waterlogging quickly.`,
        type: "point_gain"
      });

      alert("Point Multiplier Event registered and broadcasted!");
      setNewMultiplier({
        district: "Coimbatore",
        multiplier: 2,
        startDate: "",
        endDate: ""
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4">
        <Sparkles className="w-8 h-8 text-primary animate-pulse" />
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Loading rewards console…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4 px-6 text-center">
        <X className="w-8 h-8 text-red-500" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Failed to load the rewards console.</p>
        <button onClick={fetchData} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md">Retry</button>
      </div>
    );
  }

  // Calculate Points Analytics
  const pointsIssued = civilians.reduce((sum, c) => sum + c.points_total, 0);
  const pointsRedeemed = civilians.reduce((sum, c) => sum + c.points_redeemed, 0);

  const pendingRedemptions = redemptions.filter(r => r.status === "pending");

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark text-slate-800 dark:text-slate-100 flex flex-col transition-colors pb-12">
      <Navbar portal="admin" userName={session?.name} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 lg:px-8 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Redemptions & Catalog panel */}
        <div className="lg:col-span-8 space-y-6">

          {/* Points analytics summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">Points Issued</span>
                <strong className="text-xl font-display font-black text-secondary dark:text-white block mt-0.5">{pointsIssued.toLocaleString()}</strong>
              </div>
              <Award className="w-6 h-6 text-primary shrink-0" />
            </div>
            <div className="p-4 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">Points Redeemed</span>
                <strong className="text-xl font-display font-black text-success block mt-0.5">{pointsRedeemed.toLocaleString()}</strong>
              </div>
              <TrendingUp className="w-6 h-6 text-success shrink-0" />
            </div>
            <div className="p-4 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">Pending Requests</span>
                <strong className="text-xl font-display font-black text-warning block mt-0.5">{pendingRedemptions.length}</strong>
              </div>
              <ShieldCheck className="w-6 h-6 text-warning shrink-0" />
            </div>
          </div>

          {/* Redemption queue */}
          <div className="p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg space-y-4">
            <div>
              <h2 className="text-base md:text-lg font-display font-black tracking-tight dark:text-white text-secondary">
                Pending Eco Redemptions
              </h2>
              <p className="text-[11px] text-slate-400">Citizen requests waiting for physical sapling/seeds distribution approvals</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[520px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-mono text-slate-400 tracking-wider">
                    <th className="pb-3">Citizen</th>
                    <th className="pb-3">Reward Item</th>
                    <th className="pb-3">Points Cost</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Approve</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {pendingRedemptions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-slate-400">No pending requests. All tickets resolved!</td>
                    </tr>
                  ) : (
                    pendingRedemptions.map((red) => {
                      const userObj = civilians.find(c => c.id === red.civilian_id);
                      return (
                        <tr key={red.id} className="text-xs hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition">
                          <td className="py-3 font-bold dark:text-slate-200 text-slate-700">
                            {userObj?.full_name || "Unknown Citizen"}
                            <span className="text-[10px] text-slate-400 font-mono block">District: {userObj?.district}</span>
                          </td>
                          <td className="py-3">
                            {red.item_name}
                          </td>
                          <td className="py-3 font-mono font-bold text-primary">
                            {red.points_cost} PTS
                          </td>
                          <td className="py-3 capitalize">
                            <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning font-bold text-[9px]">
                              {red.status}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex justify-end space-x-1.5">
                              <button
                                onClick={() => handleRejectRedemption(red.id)}
                                className="p-1 rounded bg-danger/10 hover:bg-danger/20 text-danger transition"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleApproveRedemption(red.id)}
                                className="p-1 rounded bg-success/10 hover:bg-success/20 text-success transition"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reward Catalog Editor */}
          <div className="p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg space-y-4">
            <div>
              <h2 className="text-base md:text-lg font-display font-black tracking-tight dark:text-white text-secondary">
                Reward Catalog
              </h2>
              <p className="text-[11px] text-slate-400">Eco-store catalog inventory stocks and points pricing adjustments</p>
            </div>

            {rewards.length === 0 ? (
              <div className="py-10 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center">
                <Tag className="w-7 h-7 mx-auto mb-2 text-slate-400" />
                <p className="text-xs text-slate-400">No eco items in the catalog yet. Add your first reward using the form.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rewards.map((item) => (
                  <div
                    key={item.id}
                    className={`group p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-start gap-3 transition hover:shadow-md hover:border-primary/30 ${
                      item.active === false ? "opacity-60" : ""
                    }`}
                  >
                    <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center text-2xl leading-none shrink-0">
                      {item.icon || "🎁"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <strong className="text-sm font-bold dark:text-slate-200 text-slate-700 leading-snug line-clamp-2">
                          {item.name}
                        </strong>
                        <span
                          className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
                            item.stock > 10
                              ? "text-success bg-success/10"
                              : item.stock > 0
                                ? "text-warning bg-warning/10"
                                : "text-danger bg-danger/10"
                          }`}
                        >
                          {item.stock > 0 ? `${item.stock} left` : "Out of stock"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 capitalize font-medium">
                          {item.category}
                        </span>
                        <span className="text-xs font-mono font-bold text-primary">
                          {(item.points_cost ?? 0).toLocaleString()} PTS
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Multipliers & Side additions pane */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Points Multiplier engine */}
          <div className="p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg space-y-4">
            <div className="flex items-center space-x-1.5 text-primary font-bold text-base font-display">
              <Zap className="w-5 h-5 animate-pulse" />
              <span>Points Multiplier Engine</span>
            </div>
            
            <form onSubmit={handleCreateMultiplier} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-slate-400 block">District Zone</label>
                <select
                  value={newMultiplier.district}
                  onChange={(e) => setNewMultiplier(prev => ({ ...prev, district: e.target.value }))}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none"
                >
                  <option value="Coimbatore">Coimbatore (கோயம்புத்தூர்)</option>
                  <option value="Chennai">Chennai (சென்னை)</option>
                  <option value="Madurai">Madurai</option>
                  <option value="Salem">Salem</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-slate-400 block">Point Multiplier Scale</label>
                <select
                  value={newMultiplier.multiplier}
                  onChange={(e) => setNewMultiplier(prev => ({ ...prev, multiplier: Number(e.target.value) }))}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold focus:outline-none"
                >
                  <option value={1.5}>1.5x Points Booster</option>
                  <option value={2}>2.0x Double Points</option>
                  <option value={3}>3.0x Triple Points (Emergency)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block">Start Date</label>
                  <input
                    type="date"
                    required
                    value={newMultiplier.startDate}
                    onChange={(e) => setNewMultiplier(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block">End Date</label>
                  <input
                    type="date"
                    required
                    value={newMultiplier.endDate}
                    onChange={(e) => setNewMultiplier(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold transition flex items-center justify-center space-x-1"
              >
                <Zap className="w-4 h-4" />
                <span>Deploy Multiplier Booster</span>
              </button>
            </form>

            {/* Active Multipliers List */}
            <div className="space-y-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[9.5px] font-mono uppercase tracking-wider text-slate-400 block">Active point boosters</span>
              {multipliers.length === 0 ? (
                <p className="text-[11px] text-slate-400 py-3 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                  No active boosters. Deploy one above to multiply points.
                </p>
              ) : (
                multipliers.map((m, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <strong className="font-bold text-primary block truncate">{m.district} Booster</strong>
                      <span className="text-[10px] text-slate-400 block font-mono truncate">Range: {m.startDate} to {m.endDate}</span>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-primary text-white font-mono font-bold shrink-0">
                      {m.multiplier}x
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Catalog Add form */}
          <div className="p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg space-y-4">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400">Add reward item</h2>
            <form onSubmit={handleCreateRewardItem} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-slate-400 block">Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Teak Sapling (தேக்கு)"
                  value={newItem.name}
                  onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block">Emoji Icon</label>
                  <input
                    type="text"
                    required
                    value={newItem.icon}
                    onChange={(e) => setNewItem(prev => ({ ...prev, icon: e.target.value }))}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none text-center text-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block">Stock Qty</label>
                  <input
                    type="number"
                    required
                    value={newItem.stock}
                    onChange={(e) => setNewItem(prev => ({ ...prev, stock: Number(e.target.value) }))}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 font-semibold">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block">Points Cost</label>
                  <input
                    type="number"
                    required
                    value={newItem.pointsCost}
                    onChange={(e) => setNewItem(prev => ({ ...prev, pointsCost: Number(e.target.value) }))}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none text-center text-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block">Category</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem(prev => ({ ...prev, category: e.target.value as any }))}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none"
                  >
                    <option value="plant">Plant / seeds</option>
                    <option value="food">Food staples</option>
                    <option value="eco">Eco Products</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-secondary hover:bg-secondary-hover text-white font-bold rounded-xl transition"
              >
                Publish Reward Catalog Item
              </button>
            </form>
          </div>

        </div>

      </main>
    </div>
  );
}
