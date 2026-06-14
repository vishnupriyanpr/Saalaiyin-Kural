"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, Legend, CartesianGrid,
} from "recharts";
import { AlertCircle, TrendingUp, CalendarClock, ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { useWebSocket } from "@/lib/useWebSocket";
import type { TransparencyData } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  pending: "#94A3B8",
  in_progress: "#D97706",
  resolved: "#16A34A",
  rejected: "#DC2626",
};

function formatINR(n: number): string {
  return `₹${(n || 0).toLocaleString("en-IN")}`;
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-slate-200 animate-pulse rounded-xl ${className}`} />;
}

export default function TransparencyPage() {
  const [data, setData] = useState<TransparencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Reusable data load. `silent` skips the full-page loading skeleton so that
  // background refreshes (polling / WS push) don't flash the UI.
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const res = await db.getTransparency();
      setData(res);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
      if (!silent) setError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Keep `load` name for the existing retry/initial-load UI.
  const load = useCallback(() => fetchData(false), [fetchData]);

  // Initial load.
  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // Polling fallback — this page is PUBLIC (visitors have no token/WS), so a
  // 20s poll keeps the data fresh for them. Cleared on unmount.
  useEffect(() => {
    const id = setInterval(() => fetchData(true), 20000);
    return () => clearInterval(id);
  }, [fetchData]);

  // WS push for logged-in viewers. useWebSocket no-ops when getToken() is null
  // (public visitors) — verified in lib/useWebSocket.ts — so this is safe here.
  const handleRealtime = useCallback(
    (payload: any) => {
      if (payload?.type === "TRANSPARENCY_UPDATE" || payload?.type === "ROAD_UPDATE") {
        fetchData(true);
      }
    },
    [fetchData]
  );
  useWebSocket(handleRealtime);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 md:px-8 py-10">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-80" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-500" />
        <p className="text-sm font-semibold text-slate-700">Failed to load transparency data.</p>
        <button onClick={load} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md">
          Retry
        </button>
      </div>
    );
  }

  const budgetByRoad = (data.roads || []).map((r) => ({
    name: r.name,
    Sanctioned: r.budget_sanctioned || 0,
    Spent: r.budget_spent || 0,
  }));

  const statusData = Object.entries(data.complaintsByStatus || {}).map(([k, v]) => ({
    name: k.replace("_", " "),
    key: k,
    value: v,
  }));

  const topRoads = (data.topRoadsByComplaints || []).slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Public header */}
      <header className="bg-gradient-to-r from-[#1A3A5C] to-[#0f2540] text-white px-4 md:px-8 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-300">Public Transparency Portal</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[10px] font-mono font-bold uppercase tracking-wider">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                </span>
                Live
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-display font-black mt-1 break-words">Road Maintenance & Budget Transparency</h1>
            <p className="text-xs text-slate-300 mt-1">Open public data — no login required.</p>
            {lastUpdated && (
              <p className="text-[10px] font-mono text-slate-400 mt-1">
                Last updated {lastUpdated.toLocaleTimeString("en-IN", { hour12: false })}
              </p>
            )}
          </div>
          <Link href="/" className="hidden sm:inline-flex items-center text-xs font-mono text-slate-300 hover:text-white transition">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Home
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8">
        {/* Big stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Total Roads</span>
            <strong className="text-3xl font-black text-secondary block mt-1">{data.totalRoads}</strong>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center"><TrendingUp className="w-3.5 h-3.5 mr-1 text-emerald-500" />Resolution Rate</span>
            <strong className="text-3xl font-black text-emerald-600 block mt-1">{Math.round((data.resolutionRate || 0) * (data.resolutionRate <= 1 ? 100 : 1))}%</strong>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center"><CalendarClock className="w-3.5 h-3.5 mr-1 text-amber-500" />Avg Resolution</span>
            <strong className="text-3xl font-black text-amber-600 block mt-1">{(data.avgResolutionDays || 0).toFixed(1)}<span className="text-sm font-bold ml-1">days</span></strong>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Budget Sanctioned</span>
            <strong className="text-2xl font-black text-secondary block mt-1">{formatINR(data.budgetSanctionedTotal)}</strong>
            <span className="text-[10px] text-slate-400 mt-1 block">Spent: {formatINR(data.budgetSpentTotal)}</span>
          </div>
        </div>

        {/* Budget per road + status donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <h2 className="font-display font-bold text-sm mb-4">Budget: Sanctioned vs Spent (per road)</h2>
            {budgetByRoad.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-12">No road budget data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(240, budgetByRoad.length * 44)}>
                <BarChart data={budgetByRoad} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Sanctioned" fill="#1A3A5C" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Spent" fill="#FF6B2C" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <h2 className="font-display font-bold text-sm mb-4">Complaints by Status</h2>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {statusData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key] || "#94A3B8"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 5 roads by complaints */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <h2 className="font-display font-bold text-sm mb-4">Top 5 Roads by Complaints</h2>
          {topRoads.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No complaint hotspots reported.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topRoads} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#D97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Roads table */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
          <h2 className="font-display font-bold text-sm mb-4">All Roads</h2>
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase font-mono text-slate-400">
                <th className="pb-3 pr-3">Road</th>
                <th className="pb-3 pr-3">Contractor</th>
                <th className="pb-3 pr-3">Sanctioned</th>
                <th className="pb-3 pr-3">Spent</th>
                <th className="pb-3 pr-3">Last Maintained</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.roads || []).length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-xs text-slate-400">No roads on record.</td></tr>
              ) : (
                (data.roads || []).map((r) => (
                  <tr key={r.id} className="text-xs">
                    <td className="py-3 pr-3">
                      <strong className="text-slate-700 block">{r.name}</strong>
                      {r.type && <span className="text-[10px] text-slate-400">{r.type}</span>}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="text-slate-700 block">{r.contractor_name || "—"}</span>
                      {r.contractor_contact && <span className="text-[10px] text-slate-400 font-mono">{r.contractor_contact}</span>}
                    </td>
                    <td className="py-3 pr-3 font-mono text-slate-700">{formatINR(r.budget_sanctioned)}</td>
                    <td className="py-3 pr-3 font-mono text-slate-700">{formatINR(r.budget_spent)}</td>
                    <td className="py-3 pr-3 font-mono text-slate-500">
                      {r.last_relayed_date ? new Date(r.last_relayed_date).toLocaleDateString("en-IN") : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
