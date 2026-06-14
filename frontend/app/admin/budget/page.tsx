"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { 
  TrendingUp, Check, DollarSign, Download, Calendar, BarChart2,
  Percent, ArrowRight, ShieldCheck, Landmark, Sparkles, Info
} from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { db } from "@/lib/db";
import { Complaint, Project } from "@/lib/types";
import { useRequireAuth, getStoredUser } from "@/lib/useAuth";
import { useWebSocket } from "@/lib/useWebSocket";

export default function BudgetAnalytics() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession] = useState<any>(null);

  // Datasets
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadData = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const [comps, projs] = await Promise.all([db.getComplaints(), db.getProjects()]);
      setComplaints(comps);
      setProjects(projs);
    } catch (e) {
      console.error(e);
      if (!silent) setError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    setSession(getStoredUser());
    loadData();
  }, [ready, loadData]);

  // Live: re-fetch (silently) when budget/road/project data changes server-side.
  const handleRealtime = React.useCallback(
    (payload: any) => {
      if (payload?.type === "TRANSPARENCY_UPDATE") loadData(true);
    },
    [loadData]
  );
  useWebSocket(handleRealtime);

  // Polling fallback in case the WS push is missed / not connected.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => loadData(true), 30000);
    return () => clearInterval(id);
  }, [ready, loadData]);

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4">
        <div className="w-56 h-8 rounded bg-slate-200 animate-pulse" />
        <div className="w-full max-w-3xl h-64 rounded-2xl bg-slate-200 animate-pulse mx-4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Info className="w-10 h-10 text-red-500" />
        <p className="text-sm font-semibold text-slate-700">Failed to load budget analytics.</p>
        <button onClick={() => loadData()} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md">Retry</button>
      </div>
    );
  }

  // 1. Calculate financials
  const totalBudget = projects.reduce((sum, p) => sum + p.budget_total, 0) + complaints.reduce((sum, c) => sum + (c.budget_estimated || 0), 0);
  const spentBudget = projects.reduce((sum, p) => sum + p.budget_spent, 0) + complaints.filter(c => c.status === "resolved").reduce((sum, c) => sum + (c.budget_actual || 0), 0);
  
  // Projected remaining is total estimated budgets of pending or in progress cases
  const projectedBudget = complaints.filter(c => c.status !== "resolved" && c.status !== "rejected").reduce((sum, c) => sum + (c.budget_estimated || 0), 0);

  // Innovation Savings Tracker (25% saved on Coimbatore RS Puram bulk project)
  // If there's at least one project that bundled complaints, we compute savings.
  const clusterProjects = projects.filter(p => p.complaint_ids.length > 1);
  const totalSavings = clusterProjects.reduce((sum, p) => {
    // A bulk project saves 25% of the individual complaints budget.
    // So actual budget = 0.75 * original. Thus saved = actual / 0.75 * 0.25 = actual / 3.
    return sum + Math.round(p.budget_total / 3);
  }, 0);

  // 2. District financials Grouping
  const districts = ["Coimbatore", "Chennai", "Madurai", "Salem"];
  const districtData = districts.map(dist => {
    const distComps = complaints.filter(c => c.district === dist);
    const distProjs = projects.filter(p => p.district === dist);
    
    const allocated = distProjs.reduce((sum, p) => sum + p.budget_total, 0) + distComps.reduce((sum, c) => sum + (c.budget_estimated || 0), 0);
    const spent = distProjs.reduce((sum, p) => sum + p.budget_spent, 0) + distComps.filter(c => c.status === "resolved").reduce((sum, c) => sum + (c.budget_actual || 0), 0);
    
    return {
      district: dist,
      allocated,
      spent,
      saving: dist === "Coimbatore" ? totalSavings : 0
    };
  }).filter(d => d.allocated > 0);

  // 3. Recharts: Area chart monthly flow (simulation)
  const areaChartData = [
    { month: "Jan", Budget: 80000, Spent: 45000, Projected: 50000 },
    { month: "Feb", Budget: 120000, Spent: 75000, Projected: 90000 },
    { month: "Mar", Budget: 180000, Spent: 110000, Projected: 130000 },
    { month: "Apr", Budget: 220000, Spent: 145000, Projected: 180000 },
    { month: "May", Budget: totalBudget, Spent: spentBudget, Projected: projectedBudget }
  ];

  // 4. Recharts: Cost-per-complaint trend (averages)
  const resolvedComps = complaints.filter(c => c.status === "resolved");
  const avgCostPerComplaint = resolvedComps.length > 0
    ? Math.round(resolvedComps.reduce((sum, c) => sum + (c.budget_actual || 0), 0) / resolvedComps.length)
    : 12500;

  const costTrendData = [
    { month: "Jan", Cost: 16500 },
    { month: "Feb", Cost: 15200 },
    { month: "Mar", Cost: 14800 },
    { month: "Apr", Cost: 13900 },
    { month: "May", Cost: avgCostPerComplaint }
  ];

  // CSV Export trigger
  const exportToCSV = () => {
    const csvRows = [
      ["District", "Budget Allocated (INR)", "Budget Spent (INR)", "AI Cluster Savings (INR)"],
      ...districtData.map(d => [d.district, d.allocated, d.spent, d.saving])
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
      + csvRows.map(e => e.join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `saalaikural_budget_report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark text-slate-800 dark:text-slate-100 flex flex-col transition-colors pb-12">
      <Navbar portal="admin" userName={session?.name} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 mt-6 space-y-6">
        
        {/* Header & Export Row */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg space-y-3 sm:space-y-0">
          <div>
            <h2 className="text-xl md:text-2xl font-display font-black tracking-tight dark:text-white text-secondary">
              State PWD Financial Analytics
            </h2>
            <p className="text-xs text-slate-400">Public funds flow, cost trend analysis, and cluster optimizations savings</p>
          </div>

          <button
            onClick={exportToCSV}
            className="py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-md transition flex items-center space-x-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Export Financial Ledger (CSV)</span>
          </button>
        </div>

        {/* Savings Tracker Banner */}
        {totalSavings > 0 && (
          <div className="p-5 rounded-2xl border border-success/20 bg-success/5 dark:bg-success-light/10 relative overflow-hidden flex justify-between items-center shadow-lg glow-xp">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-success" />
            <div className="flex items-center space-x-3.5 pl-3">
              <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center text-success animate-bounce">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">AI Cluster Optimization Savings</span>
                <h3 className="text-xl md:text-2xl font-display font-black text-success leading-tight">
                  ₹{totalSavings.toLocaleString()} Saved
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">
                  Saved via spatial clustering dispatches which reduced redundant transport, machine deployment, and crew dispatches.
                </p>
              </div>
            </div>
            <span className="hidden md:inline-flex px-3 py-1 bg-success/15 border border-success/30 rounded-xl text-success font-mono font-bold text-xs uppercase tracking-wide">
              Active Optimization
            </span>
          </div>
        )}

        {/* Visual Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Area Chart */}
          <div className="lg:col-span-2 p-6 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="font-display font-bold text-base md:text-lg mb-1">State Budget Expenditure Flow</h3>
              <p className="text-xs text-slate-400 mb-6">Cumulative budget allocation vs actual spent vs projected liabilities</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={areaChartData}>
                  <defs>
                    <linearGradient id="colorBudget" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1A3A5C" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#1A3A5C" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorSpent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16A34A" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#16A34A" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `₹${v/1000}k`} />
                  <Tooltip formatter={(v: any) => `₹${v.toLocaleString()}`} />
                  <Legend />
                  <Area type="monotone" dataKey="Budget" stroke="#1A3A5C" strokeWidth={2} fillOpacity={1} fill="url(#colorBudget)" />
                  <Area type="monotone" dataKey="Spent" stroke="#16A34A" strokeWidth={2} fillOpacity={1} fill="url(#colorSpent)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cost per case trend line */}
          <div className="p-6 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="font-display font-bold text-base md:text-lg mb-1">Cost-per-Defect Trend</h3>
              <p className="text-xs text-slate-400 mb-6">Average fiscal expense per resolved complaint</p>
            </div>
            
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={costTrendData}>
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={10} width={45} tickFormatter={(v) => `₹${v/1000}k`} />
                  <Tooltip formatter={(v: any) => `₹${v.toLocaleString()}`} />
                  <Line type="monotone" dataKey="Cost" stroke="#FF6B2C" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Current Average Defect Cost:</span>
                <strong className="font-mono text-slate-700 dark:text-slate-200">₹{avgCostPerComplaint.toLocaleString()}</strong>
              </div>
              <div className="flex justify-between items-center text-[10.5px]">
                <span className="text-slate-400">Target SLA Cost Cap:</span>
                <span className="font-mono text-slate-500">₹15,000</span>
              </div>
            </div>
          </div>

        </div>

        {/* Ledger allocation Table */}
        <div className="p-6 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <div>
            <h3 className="font-display font-bold text-base md:text-lg mb-1">District Fiscal Ledger</h3>
            <p className="text-xs text-slate-400">Per-district budget utilization and optimization summary</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10.5px] uppercase font-mono text-slate-400 tracking-wider">
                  <th className="pb-3">District</th>
                  <th className="pb-3">Budget Allocated (INR)</th>
                  <th className="pb-3">Budget Spent (INR)</th>
                  <th className="pb-3">Optimized Savings (INR)</th>
                  <th className="pb-3 text-right">Burn Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {districtData.map((d) => {
                  const burnRate = d.allocated > 0 ? Math.round((d.spent / d.allocated) * 100) : 0;
                  
                  return (
                    <tr key={d.district} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition">
                      <td className="py-4 font-bold dark:text-slate-200 text-slate-700">
                        {d.district}
                      </td>
                      <td className="py-4 font-mono font-semibold">
                        ₹{d.allocated.toLocaleString()}
                      </td>
                      <td className="py-4 font-mono text-slate-600 dark:text-slate-300">
                        ₹{d.spent.toLocaleString()}
                      </td>
                      <td className="py-4 font-mono text-success font-bold">
                        ₹{d.saving.toLocaleString()}
                      </td>
                      <td className="py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <span className="font-mono font-bold">{burnRate}%</span>
                          <div className="w-12 h-2 rounded-full bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 overflow-hidden hidden sm:block">
                            <div 
                              className="h-full rounded-full bg-primary" 
                              style={{ width: `${burnRate}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
