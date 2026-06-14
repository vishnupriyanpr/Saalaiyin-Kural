"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import {
  TrendingUp, CheckCircle2, Loader2, Users, AlertTriangle, ArrowRight,
  DollarSign, Award, RefreshCw, FileText, ChevronRight, MapPin, Zap, Cpu,
} from "lucide-react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useInView,
} from "framer-motion";
import Navbar from "@/components/shared/Navbar";
import GlowButton from "@/components/shared/GlowButton";
import { db } from "@/lib/db";
import { Complaint, CivilianUser, Worker, Project, Stats } from "@/lib/types";
import { useRequireAuth, getStoredUser } from "@/lib/useAuth";
import { useWebSocket } from "@/lib/useWebSocket";

/* ─── helpers ────────────────────────────────────────────── */
function getDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ─── Animated spring counter ────────────────────────────── */
function SpringCounter({
  value, prefix = "", suffix = "", className = "",
}: { value: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 18 });
  const inView = useInView(ref, { once: true });

  useEffect(() => { if (inView) mv.set(value); }, [inView, mv, value]);
  useEffect(() =>
    spring.on("change", (v) => {
      if (ref.current)
        ref.current.textContent = prefix + Math.round(v).toLocaleString() + suffix;
    }),
    [spring, prefix, suffix]
  );
  return <span ref={ref} className={className}>{prefix}0{suffix}</span>;
}

/* ─── Variants ───────────────────────────────────────────── */
const pageStagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const cardIn = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show:   { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 200, damping: 22 } },
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
const SEV_COLORS: Record<string, string> = {
  low: "bg-slate-400", medium: "bg-blue-400", high: "bg-amber-500", critical: "bg-red-500",
};

export default function AdminDashboard() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession]       = useState<any>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [civilians, setCivilians]   = useState<CivilianUser[]>([]);
  const [workers, setWorkers]       = useState<Worker[]>([]);
  const [projects, setProjects]     = useState<Project[]>([]);
  const [stats, setStats]           = useState<Stats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [statusFilter, setStatusFilter]     = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");

  const fetchData = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const [comps, civs, wrks, projs, st] = await Promise.all([
        db.getComplaints(), db.getCivilians(), db.getWorkers(), db.getProjects(), db.getStats(),
      ]);
      setComplaints(comps); setCivilians(civs); setWorkers(wrks); setProjects(projs); setStats(st);
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
    if (parsed?.adminRole && parsed.adminRole !== "state" && parsed.district) {
      setDistrictFilter(parsed.district);
    }
    fetchData();
  }, [ready, fetchData]);

  // Live: re-fetch (silently) on any relevant server-side change.
  const handleRealtime = React.useCallback(
    (payload: any) => {
      if (
        payload?.type === "TRANSPARENCY_UPDATE" ||
        payload?.type === "COMPLAINT_UPDATE" ||
        payload?.type === "ASSIGNMENT"
      ) {
        fetchData(true);
      }
    },
    [fetchData]
  );
  useWebSocket(handleRealtime);

  // Polling fallback in case the WS push is missed / not connected.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(id);
  }, [ready, fetchData]);

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
          <Loader2 className="w-10 h-10 text-primary" />
        </motion.div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-xs font-mono text-slate-400 uppercase tracking-widest">
          Loading State Console…
        </motion.p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-500" />
        <p className="text-sm font-semibold text-slate-700">Failed to load the State Console.</p>
        <button onClick={() => fetchData()} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md">
          Retry
        </button>
      </div>
    );
  }

  const userDistrict = session?.adminRole === "state" ? null : session?.district;
  const displayComplaints = userDistrict ? complaints.filter(c => c.district === userDistrict) : complaints;
  const displayWorkers    = userDistrict ? workers.filter(w => w.availability === "available") : workers;

  /* KPIs — prefer real aggregates from /api/stats, fall back to list-derived counts */
  const totalReports    = stats?.totalComplaints ?? displayComplaints.length;
  const resolvedReports = stats?.resolvedComplaints ?? displayComplaints.filter(c => c.status === "resolved").length;
  const inProgress      = stats?.inProgressComplaints ?? displayComplaints.filter(c => c.status === "in_progress" || c.status === "assigned").length;
  const activeWorkers   = stats?.activeWorkers ?? displayWorkers.filter(w => w.availability === "available").length;

  /* Cluster detection */
  const pending = displayComplaints.filter(c => c.status === "pending");
  let activeCluster: Complaint[] = [];
  for (let i = 0; i < pending.length; i++) {
    const base = pending[i];
    const cluster = [base, ...pending.filter((_, j) => j !== i && getDistance(base.lat, base.lng, pending[j].lat, pending[j].lng) <= 0.5)];
    if (cluster.length >= 5) { activeCluster = cluster; break; }
  }

  const handleCreateBulkProject = async () => {
    if (!activeCluster.length) return;
    const orig = activeCluster.reduce((s, c) => s + (c.budget_estimated || 0), 0);
    const combined = Math.round(orig * 0.75);
    try {
      const id = `proj-${Math.random().toString(36).substr(2, 9)}`;
      await db.createProject({ id, complaint_ids: activeCluster.map(c => c.id), title: "RS Puram Cluster Bulk Repair", district: "Coimbatore", budget_total: combined, budget_spent: 0, status: "planning", worker_ids: ["wrk-111"] });
      for (const comp of activeCluster) await db.updateComplaint(comp.id, { status: "assigned", worker_id: "wrk-111" });
      alert(`Bulk project created! Saved ₹${(orig - combined).toLocaleString()} (25% saving).`);
    } catch (e) { console.error(e); }
  };

  /* Chart data */
  const districtCounts = complaints.reduce((acc: any, c) => { acc[c.district] = (acc[c.district] || 0) + 1; return acc; }, {});
  const barData = Object.keys(districtCounts).map(d => ({ name: d, reports: districtCounts[d] }));

  const totalBudget   = stats?.totalBudget ?? (projects.reduce((s, p) => s + p.budget_total, 0) + complaints.reduce((s, c) => s + (c.budget_estimated || 0), 0));
  const spentBudget   = stats?.spentBudget ?? (projects.reduce((s, p) => s + p.budget_spent, 0) + complaints.filter(c => c.status === "resolved").reduce((s, c) => s + (c.budget_actual || 0), 0));
  const pieData = [
    { name: "Spent",     value: spentBudget,                   color: "#1A3A5C" },
    { name: "Remaining", value: Math.max(totalBudget - spentBudget, 0), color: "#FF6B2C" },
  ];

  const leaderboard = [...civilians].sort((a, b) => b.points_total - a.points_total).slice(0, 10);
  const filteredComplaints = complaints.filter(c => {
    const st = statusFilter   === "all" || c.status   === statusFilter;
    const di = districtFilter === "all" || c.district === districtFilter;
    return st && di;
  });

  const KPI_ITEMS = [
    { label: "Total Complaints",     val: totalReports,    icon: FileText,    color: "text-blue-600 bg-blue-50 border-blue-200"     },
    { label: "Resolved",             val: resolvedReports, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    { label: "In Progress/Assigned", val: inProgress,      icon: Loader2,      color: "text-amber-600 bg-amber-50 border-amber-200"  },
    { label: "Available Workers",    val: activeWorkers,   icon: Users,        color: "text-primary bg-orange-50 border-orange-200"  },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col pb-12">
      <Navbar portal="admin" userName={session?.name} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 mt-6">
        <motion.div
          variants={pageStagger}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >

          {/* ── Welcome Banner ── */}
          <motion.div
            variants={cardIn}
            className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 rounded-2xl bg-gradient-to-r from-[#1A3A5C] to-slate-900 border border-slate-800 text-white shadow-xl overflow-hidden"
          >
            {/* Animated background lines */}
            {[...Array(4)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute left-0 w-full h-px bg-white/5"
                style={{ top: `${20 + i * 22}%` }}
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 4 + i, repeat: Infinity, ease: "linear", delay: i * 0.5 }}
              />
            ))}

            <div className="relative z-10">
              <motion.h2
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 220 }}
                className="text-2xl md:text-3xl font-display font-extrabold tracking-tight"
              >
                State Control Console
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 }}
                className="text-xs text-slate-400 font-mono mt-1"
              >
                Session: {session?.name} · {session?.adminRole} · {session?.district || "Statewide"}
              </motion.p>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.45 }}
              className="mt-4 sm:mt-0 px-4 py-2 bg-white/5 border border-white/10 rounded-xl flex items-center space-x-2 text-xs font-mono relative z-10"
            >
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                <RefreshCw className="w-3.5 h-3.5 text-primary" />
              </motion.span>
              <span>Realtime Subscriptions Active</span>
            </motion.div>
          </motion.div>

          {/* ── AI Cluster Alert ── */}
          <AnimatePresence>
            {activeCluster.length >= 5 && (
              <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 280, damping: 24 }}
                className="p-5 rounded-2xl border border-primary/30 bg-primary/5 relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0"
                style={{ boxShadow: "0 0 0 1px rgba(255,107,44,0.15), 0 0 30px rgba(255,107,44,0.12)" }}
              >
                {/* Pulsing left border */}
                <motion.div
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="absolute top-0 left-0 w-1.5 h-full bg-primary rounded-l-2xl"
                />

                {/* Cluster alert shimmer overlay */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "linear", repeatDelay: 3 }}
                  style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,107,44,0.08) 50%, transparent 100%)" }}
                />

                <div className="pl-5 relative z-10">
                  <div className="flex items-center space-x-2 text-primary font-bold text-sm md:text-base">
                    <motion.span
                      animate={{ scale: [1, 1.3, 1], rotate: [0, -8, 8, 0] }}
                      transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 1 }}
                    >
                      <AlertTriangle className="w-5 h-5" />
                    </motion.span>
                    <span>AI Spatiotemporal Cluster Alert!</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                    Detected <strong className="text-primary">{activeCluster.length} pending complaints</strong> within{" "}
                    <strong>500m radius</strong>. Single bulk project generates{" "}
                    <strong>25% budget saving (₹{Math.round(activeCluster.reduce((s, c) => s + (c.budget_estimated || 0), 0) * 0.25).toLocaleString()} saved)</strong>.
                  </p>
                </div>

                <GlowButton
                  onClick={handleCreateBulkProject}
                  variant="primary" size="sm"
                  icon={<><Zap className="w-4 h-4" /><ArrowRight className="w-4 h-4" /></>}
                >
                  Deploy Bulk Project
                </GlowButton>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── KPI Cards ── */}
          <motion.div variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {KPI_ITEMS.map((item, i) => (
              <motion.div
                key={i}
                variants={cardIn}
                whileHover={{ y: -6, boxShadow: "0 20px 40px rgba(0,0,0,0.08)" }}
                className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex justify-between items-center cursor-default"
              >
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">{item.label}</span>
                  <SpringCounter value={item.val} className="text-3xl font-display font-black text-slate-800" />
                </div>
                <motion.div
                  whileHover={{ rotate: 15, scale: 1.12 }}
                  className={`p-3.5 rounded-xl border ${item.color}`}
                >
                  <item.icon className="w-6 h-6" />
                </motion.div>
              </motion.div>
            ))}
          </motion.div>

          {/* ── Traffic Management Engine (dedicated page) ── */}
          <motion.button
            variants={cardIn}
            onClick={() => router.push("/admin/traffic")}
            whileHover={{ y: -4, boxShadow: "0 24px 48px rgba(0,0,0,0.18)" }}
            className="w-full text-left p-6 rounded-2xl bg-gradient-to-br from-[#0F141C] via-[#131A24] to-[#0c1934] text-white shadow-xl relative overflow-hidden group"
          >
            <div className="absolute top-[-40%] right-[-5%] w-60 h-60 rounded-full bg-secondary/20 blur-3xl pointer-events-none" />
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <motion.div whileHover={{ rotate: 12, scale: 1.08 }} className="p-3 rounded-xl bg-white/5 border border-white/10 shrink-0">
                  <Cpu className="w-6 h-6 text-secondary" />
                </motion.div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                    Smart Infrastructure · போக்குவரத்து மேலாண்மை
                  </span>
                  <h3 className="text-lg md:text-xl font-display font-black tracking-tight mt-0.5">Traffic Management Engine</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                    AI max-pressure adaptive signal control on a live junction simulation — compare adaptive vs fixed-time
                    controllers across queue length, average wait time and throughput.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-secondary font-bold text-sm shrink-0 group-hover:gap-3 transition-all">
                Open Engine <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </motion.button>

          {/* ── Charts Row ── */}
          <motion.div variants={cardIn} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bar chart */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <h3 className="font-display font-bold text-base md:text-lg mb-1">District-wise Complaint Load</h3>
              <p className="text-xs text-slate-400 mb-6">Road damage reports across Tamil Nadu districts</p>
              <div className="h-64">
                {barData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical">
                      <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                      <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={80} />
                      <Tooltip cursor={{ fill: "rgba(255,107,44,0.05)" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                      <Bar dataKey="reports" fill="#FF6B2C" radius={[0, 6, 6, 0]}>
                        {barData.map((_, idx) => (
                          <Cell key={idx} fill={idx % 2 === 0 ? "#FF6B2C" : "#1A3A5C"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Donut */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-display font-bold text-base md:text-lg mb-1">Budget Allocation</h3>
                <p className="text-xs text-slate-400 mb-4">Spent vs projected remaining</p>
              </div>
              <div className="relative h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => `₹${v.toLocaleString()}`} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute text-center">
                  <span className="text-[10px] uppercase font-mono text-slate-400">Total Spent</span>
                  <strong className="block text-lg font-black text-slate-800">₹{spentBudget.toLocaleString()}</strong>
                </div>
              </div>
              <div className="space-y-2 border-t border-slate-100 pt-4">
                {pieData.map((d) => (
                  <div key={d.name} className="flex justify-between items-center text-xs">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                      <span className="text-slate-500">{d.name}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-700">₹{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── Complaints + Leaderboard ── */}
          <motion.div variants={cardIn} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Complaints table */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                <div>
                  <h3 className="font-display font-bold text-base mb-0.5">Live Complaints Register</h3>
                  <p className="text-xs text-slate-400">Real-time civilian reports</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: districtFilter, onChange: (e: any) => setDistrictFilter(e.target.value), options: [["all", "All Districts"], ["Coimbatore", "Coimbatore"], ["Chennai", "Chennai"]] },
                    { value: statusFilter,   onChange: (e: any) => setStatusFilter(e.target.value),   options: [["all", "All Status"], ["pending", "Pending"], ["verified", "Verified"], ["assigned", "Assigned"], ["in_progress", "In Progress"], ["resolved", "Resolved"]] },
                  ].map((sel, i) => (
                    <motion.select key={i} whileFocus={{ scale: 1.02 }} value={sel.value} onChange={sel.onChange} className="py-1 px-2.5 rounded-lg text-xs bg-slate-50 border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition">
                      {sel.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </motion.select>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10.5px] uppercase font-mono text-slate-400 tracking-wider">
                      {["Title / Location", "Type", "Severity", "Status", ""].map(h => (
                        <th key={h} className="pb-3 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <motion.tbody
                    variants={{ show: { transition: { staggerChildren: 0.05 } } }}
                    initial="hidden"
                    animate="show"
                    className="divide-y divide-slate-100"
                  >
                    {filteredComplaints.length === 0 ? (
                      <tr><td colSpan={5} className="py-8 text-center text-xs text-slate-400">No reports matching filters</td></tr>
                    ) : (
                      filteredComplaints.slice(0, 5).map((comp) => (
                        <motion.tr
                          key={comp.id}
                          variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}
                          whileHover={{ backgroundColor: "#f8fafc" }}
                          className="text-xs transition-colors"
                        >
                          <td className="py-3.5 pr-2 max-w-[180px]">
                            <span className="font-bold block truncate text-slate-700">{comp.title}</span>
                            <span className="text-[10px] text-slate-400 flex items-center mt-0.5 truncate">
                              <MapPin className="w-3 h-3 mr-0.5 text-primary" />{comp.address}
                            </span>
                          </td>
                          <td className="py-3.5 capitalize font-mono text-[10px] text-slate-500">{comp.type}</td>
                          <td className="py-3.5">
                            <span className="flex items-center space-x-1">
                              <span className={`w-2 h-2 rounded-full ${SEV_COLORS[comp.severity]}`} />
                              <span className="capitalize text-slate-600">{comp.severity}</span>
                            </span>
                          </td>
                          <td className="py-3.5">
                            <span className={`px-2 py-0.5 rounded-full font-semibold text-[9.5px] uppercase ${STATUS_COLORS[comp.status]}`}>
                              {comp.status}
                            </span>
                          </td>
                          <td className="py-3.5 text-right">
                            <motion.button
                              whileHover={{ scale: 1.15 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => router.push(`/admin/complaints?id=${comp.id}`)}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 transition"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </motion.button>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </motion.tbody>
                </table>
              </div>

              <GlowButton
                onClick={() => router.push("/admin/complaints")}
                variant="secondary" size="sm" fullWidth magnetic={false}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Manage All ({complaints.length})
              </GlowButton>
            </div>

            {/* Leaderboard */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <h3 className="font-display font-bold text-base mb-1 flex items-center space-x-1">
                <motion.span animate={{ rotate: [0, 15, -10, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 4 }}>
                  <Award className="w-5 h-5 text-primary" />
                </motion.span>
                <span>Civilian Leaderboard</span>
              </h3>
              <p className="text-xs text-slate-400 mb-5">Top citizen reporters this month</p>

              <motion.div
                variants={{ show: { transition: { staggerChildren: 0.06 } } }}
                initial="hidden"
                animate="show"
                className="space-y-3"
              >
                {leaderboard.map((civ, i) => {
                  const rankStyles = [
                    "bg-yellow-400 text-yellow-900",
                    "bg-slate-300 text-slate-700",
                    "bg-amber-600 text-white",
                  ];
                  return (
                    <motion.div
                      key={civ.id}
                      variants={{ hidden: { opacity: 0, x: 16 }, show: { opacity: 1, x: 0 } }}
                      whileHover={{ x: -3 }}
                      className="flex justify-between items-center text-xs"
                    >
                      <div className="flex items-center space-x-3">
                        <motion.span
                          animate={i < 3 ? { scale: [1, 1.12, 1] } : {}}
                          transition={{ duration: 2, repeat: Infinity, repeatDelay: i * 0.5 }}
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${rankStyles[i] || "bg-slate-100 text-slate-500"}`}
                        >
                          {i + 1}
                        </motion.span>
                        <div>
                          <span className="font-bold text-slate-700 block truncate max-w-[120px]">{civ.full_name}</span>
                          <span className="text-[9.5px] font-mono text-slate-400">📍 {civ.district}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-primary block">{civ.points_total.toLocaleString()} PTS</span>
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-mono">{civ.level}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          </motion.div>

        </motion.div>
      </main>
    </div>
  );
}
