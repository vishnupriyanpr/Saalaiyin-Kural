"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  DollarSign, BarChart2, ShieldCheck, Info, Calendar, Landmark, 
  ArrowUpRight, PiggyBank, RefreshCw, Star
} from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { db } from "@/lib/db";
import { CivilianUser, Complaint, Project } from "@/lib/types";
import { useRequireAuth, getStoredUser } from "@/lib/useAuth";
import { useWebSocket } from "@/lib/useWebSocket";

export default function CivilianBudget() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<CivilianUser | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = React.useCallback(async (uid: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const [civ, comps, projs] = await Promise.all([
        db.getCivilianById(uid),
        db.getComplaints(),
        db.getProjects(),
      ]);
      setUser(civ);
      setProjects(projs);
      setComplaints(comps.filter(c => c.civilian_id === uid));
    } catch (e) {
      console.error(e);
      if (!silent) setError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const parsed = getStoredUser();
    setSession(parsed);
    if (parsed?.userId) fetchData(parsed.userId);
    else setLoading(false);
  }, [ready, fetchData]);

  // Live: re-fetch (silently) when budget/road/project data changes server-side.
  const handleRealtime = React.useCallback(
    (payload: any) => {
      if (payload?.type === "TRANSPARENCY_UPDATE" && session?.userId) {
        fetchData(session.userId, true);
      }
    },
    [fetchData, session]
  );
  useWebSocket(handleRealtime);

  // Polling fallback in case the WS push is missed / not connected.
  useEffect(() => {
    if (!ready || !session?.userId) return;
    const uid = session.userId;
    const id = setInterval(() => fetchData(uid, true), 30000);
    return () => clearInterval(id);
  }, [ready, session, fetchData]);

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Loading budget ledger…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4 px-6 text-center">
        <RefreshCw className="w-8 h-8 text-red-500" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Failed to load budget data.</p>
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

  // 1. Calculate civilian's personal impact (real, from their own complaints).
  //    budget_estimated is null until a complaint is triaged, so guard every read.
  const totalMobilized = complaints.reduce((sum, c) => sum + (c.budget_estimated || 0), 0);
  const totalSpentOnRepairs = complaints
    .filter(c => c.status === "resolved")
    .reduce((sum, c) => sum + (c.budget_actual || 0), 0);

  // Real savings: estimated minus actual on the user's resolved complaints
  const personalClusterSavings = complaints
    .filter(c => c.status === "resolved" && c.budget_actual != null)
    .reduce((sum, c) => sum + Math.max((c.budget_estimated || 0) - (c.budget_actual || 0), 0), 0);

  // 2. District PWD allocations derived from real project rows, grouped by district
  const districtBudgets = Object.values(
    projects.reduce((acc: Record<string, { district: string; total: number; spent: number }>, p) => {
      const key = p.district || "Unknown";
      if (!acc[key]) acc[key] = { district: key, total: 0, spent: 0 };
      acc[key].total += p.budget_total || 0;
      acc[key].spent += p.budget_spent || 0;
      return acc;
    }, {})
  );

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark text-slate-800 dark:text-slate-100 flex flex-col transition-colors pb-16">
      <Navbar portal="civilian" userName={user.full_name} userPoints={user.points_total} />

      <main className="flex-grow max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl w-full mx-auto px-4 md:px-6 lg:px-8 mt-6 space-y-6">
        
        {/* Your Impact Header card */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-secondary to-slate-900 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
          <div className="absolute top-[-25%] right-[-10%] w-48 h-48 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
          
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold block">நிதி வெளிப்படைத்தன்மை (Budget Transparency)</span>
            <h2 className="text-2xl font-display font-black tracking-tight leading-none">
              Your Fiscal Mobilization
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-sm">
              See the exact amount of public PWD repair funds mobilized in Tamil Nadu by your reports.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 px-5 py-4 rounded-xl text-center self-stretch md:self-auto shrink-0 flex flex-col justify-center items-center">
            <span className="text-[9px] uppercase font-mono tracking-wider text-slate-400 block mb-0.5">நிழல் நிதி திரட்டல் (Your PWD Impact)</span>
            <strong className="block text-xl md:text-2xl font-display font-black text-primary leading-tight">
              ₹{totalMobilized.toLocaleString()}
            </strong>
          </div>
        </div>

        {/* Savings Attributed Grid */}
        {personalClusterSavings > 0 && (
          <div className="p-4 rounded-xl border border-success/20 bg-success/5 dark:bg-success-light/10 flex items-center justify-between shadow-sm glow-xp">
            <div className="flex items-center space-x-3.5 pl-1">
              <PiggyBank className="w-6 h-6 text-success animate-bounce shrink-0" />
              <div>
                <span className="text-[9px] font-mono uppercase text-slate-400">Cooperative Spatial Optimization Savings</span>
                <strong className="text-sm font-extrabold block text-success leading-tight">
                  You helped save ₹{personalClusterSavings.toLocaleString()} PWD funds!
                </strong>
                <p className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">
                  Because your pothole report was bundled into a spatial bulk repair zone, dispatch costs were optimized.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Complaint Ledger comparisons (Simulated Chart) */}
        <div className="p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg space-y-4">
          <div>
            <h3 className="font-display font-bold text-sm md:text-base mb-1">நிதி ஒப்பீடு (Estimated vs Actual Cost)</h3>
            <p className="text-xs text-slate-400">Audit trail comparing the AI projected budgets against actual contractor receipts</p>
          </div>

          <div className="space-y-5">
            {complaints.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No reports submitted. File a report to view financial audit trails.</p>
            ) : (
              complaints.map((comp) => {
                const hasCost = comp.status === "resolved";
                const isUnderRepair = comp.status === "in_progress" || comp.status === "assigned";
                const est = comp.budget_estimated || 0;
                const saving = hasCost && comp.budget_actual ? est - comp.budget_actual : 0;

                // Progress Bar ratios
                const maxBudget = 30000;
                const estPercent = Math.min((est / maxBudget) * 100, 100);
                const actPercent = comp.budget_actual ? Math.min((comp.budget_actual / maxBudget) * 100, 100) : 0;

                return (
                  <div key={comp.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <strong className="text-xs font-bold block dark:text-slate-200 text-slate-700 truncate max-w-[200px]">
                          {comp.title}
                        </strong>
                        <span className="text-[9px] text-slate-400 font-mono block">Status: {comp.status.toUpperCase()}</span>
                      </div>
                      
                      {saving > 0 && (
                        <span className="px-2 py-0.5 rounded bg-success/15 text-success font-mono font-bold text-[9px]">
                          Saved ₹{saving.toLocaleString()} (5%)
                        </span>
                      )}
                    </div>

                    {/* Dual Budget Progress Bars */}
                    <div className="space-y-2">
                      {/* Estimated Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-mono text-slate-400 leading-none">
                          <span>Projected Budget Allocation</span>
                          <span>{comp.budget_estimated != null ? `₹${est.toLocaleString()}` : "Pending estimate…"}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-900 overflow-hidden">
                          <div 
                            className="h-full bg-secondary-hover"
                            style={{ width: `${estPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Actual Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-mono text-slate-400 leading-none">
                          <span>Actual Spent Invoice Receipt</span>
                          <span>{hasCost ? `₹${comp.budget_actual?.toLocaleString()}` : isUnderRepair ? "Under construction..." : "Pending dispatch..."}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-900 overflow-hidden">
                          <div 
                            className="h-full bg-primary"
                            style={{ width: hasCost ? `${actPercent}%` : "0%" }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Public District Budgets grid */}
        <div className="p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg space-y-4">
          <div>
            <h3 className="font-display font-bold text-sm md:text-base mb-1">மாநில பொது நிதியொதுக்கீடு (District PWD Allocations)</h3>
            <p className="text-xs text-slate-400">Public transparency ledger showing district infrastructure maintenance funds</p>
          </div>

          {districtBudgets.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">District allocation data is not available yet.</p>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {districtBudgets.map((d, idx) => {
              const spentPercent = d.total > 0 ? Math.round((d.spent / d.total) * 100) : 0;
              return (
                <div key={idx} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 space-y-2">
                  <strong className="text-xs font-bold block dark:text-slate-200 text-slate-700">{d.district}</strong>
                  <div className="text-xs space-y-1 text-slate-400">
                    <div className="flex justify-between">
                      <span>Total Fund:</span>
                      <strong className="font-mono text-slate-700 dark:text-slate-200">₹{(d.total / 100000).toFixed(1)} Lakhs</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Spent:</span>
                      <strong className="font-mono text-slate-700 dark:text-slate-200">₹{(d.spent / 100000).toFixed(1)} Lakhs ({spentPercent}%)</strong>
                    </div>
                  </div>
                  {/* progress */}
                  <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-900 overflow-hidden">
                    <div 
                      className="h-full bg-primary"
                      style={{ width: `${spentPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>

      </main>
    </div>
  );
}
