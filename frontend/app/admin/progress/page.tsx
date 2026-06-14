"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Calendar, Clock, User, HardHat, DollarSign, ArrowRight,
  TrendingUp, BarChart2, ListTodo, AlertCircle, Sparkles, LayoutDashboard, MapPin
} from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { db } from "@/lib/db";
import { Complaint, Project, Worker } from "@/lib/types";
import { useRequireAuth, getStoredUser } from "@/lib/useAuth";

// Smart ETA Predictor Simulation helper
function calculateSmartETA(comp: Complaint, assignedWorker: Worker | null): string {
  const complexityScore = comp.severity === "critical" ? 8 : comp.severity === "high" ? 6 : comp.severity === "medium" ? 4 : 2;
  const workerLoad = assignedWorker ? 2 : 1; // estimate load
  
  // Calculate average repair days (severity base + worker load modifier)
  const daysNeeded = Math.round(complexityScore * 1.2 + workerLoad * 0.5);
  
  const createdDate = new Date(comp.created_at);
  createdDate.setDate(createdDate.getDate() + daysNeeded);
  
  return createdDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export default function ProgressTracker() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession] = useState<any>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // View state: 'kanban' | 'timeline'
  const [viewMode, setViewMode] = useState<"kanban" | "timeline">("kanban");

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [comps, wrks, projs] = await Promise.all([
        db.getComplaints(),
        db.getWorkers(),
        db.getProjects(),
      ]);
      setComplaints(comps);
      setWorkers(wrks);
      setProjects(projs);
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

  // Native Drag and Drop handlers
  const handleDragStart = (e: any, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: any) => {
    e.preventDefault();
    const compId = e.dataTransfer.getData("text/plain");
    if (!compId) return;

    const comp = complaints.find(c => c.id === compId);
    if (!comp || comp.status === targetStatus) return;

    try {
      // If moving to "assigned", we should pick a default available worker
      const updates: Partial<Complaint> = { status: targetStatus };
      
      if (targetStatus === "assigned" && !comp.worker_id) {
        // Find first available worker for district
        const available = workers.find(w => w.district === comp.district && w.availability === "available");
        if (available) {
          updates.worker_id = available.id;
        }
      } else if (targetStatus === "resolved") {
        updates.budget_actual = Math.round((comp.budget_estimated || 0) * 0.95);
      }

      await db.updateComplaint(compId, updates);

      // Create Notification
      await db.createNotification({
        target_role: "admin",
        title: "Status drag-updated! 📋",
        body: `Complaint status for '${comp.title}' updated to '${targetStatus}'.`,
        type: "complaint_update"
      });

      // Notify user
      await db.createNotification({
        target_role: "civilian",
        target_id: comp.civilian_id,
        title: "Work Status Progressed 🚧",
        body: `Progress Alert: Your reported road hazard '${comp.title}' has been moved to '${targetStatus.toUpperCase()}'.`,
        type: "complaint_update"
      });

      fetchData();
    } catch (err) {
      console.error("Failed to drag and update complaint status", err);
    }
  };

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex items-center justify-center">
        <Clock className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Failed to load workflow data.</p>
        <button onClick={fetchData} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md">Retry</button>
      </div>
    );
  }

  // Filter complaints into columns
  const columns = {
    pending: { title: "Reported", items: complaints.filter(c => c.status === "pending" || c.status === "rejected") },
    verified: { title: "Verified", items: complaints.filter(c => c.status === "verified") },
    assigned: { title: "Assigned", items: complaints.filter(c => c.status === "assigned") },
    in_progress: { title: "In Progress", items: complaints.filter(c => c.status === "in_progress") },
    resolved: { title: "Resolved / Done", items: complaints.filter(c => c.status === "resolved") },
  };

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark text-slate-800 dark:text-slate-100 flex flex-col transition-colors pb-12">
      <Navbar portal="admin" userName={session?.name} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 mt-6 space-y-6">
        
        {/* Toggle switches */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg space-y-3 sm:space-y-0">
          <div>
            <h2 className="text-xl md:text-2xl font-display font-black tracking-tight dark:text-white text-secondary">
              Workflow Progress Engine
            </h2>
            <p className="text-xs text-slate-400">Drag case cards between columns to change PWD dispatch status</p>
          </div>

          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1">
            <button
              onClick={() => setViewMode("kanban")}
              className={`py-2 px-4 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
                viewMode === "kanban"
                  ? "bg-primary text-white shadow"
                  : "text-slate-500 hover:text-slate-200"
              }`}
            >
              <ListTodo className="w-3.5 h-3.5" />
              <span>Kanban Board</span>
            </button>
            <button
              onClick={() => setViewMode("timeline")}
              className={`py-2 px-4 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
                viewMode === "timeline"
                  ? "bg-primary text-white shadow"
                  : "text-slate-500 hover:text-slate-200"
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Gantt Timeline</span>
            </button>
          </div>
        </div>

        {/* View render */}
        {viewMode === "kanban" ? (
          /* KANBAN BOARD VIEW */
          <div className="flex xl:grid xl:grid-cols-5 gap-4 items-start overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x">
            {Object.keys(columns).map((statusKey) => {
              const col = (columns as any)[statusKey];
              
              // Column header colors
              const colColors: any = {
                pending: "border-t-danger text-danger",
                verified: "border-t-blue-500 text-blue-500",
                assigned: "border-t-purple-500 text-purple-500",
                in_progress: "border-t-warning text-warning",
                resolved: "border-t-success text-success"
              };

              return (
                <div
                  key={statusKey}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, statusKey)}
                  className={`p-4 rounded-2xl glass border border-slate-200 dark:border-slate-800 border-t-4 ${colColors[statusKey]} flex flex-col space-y-4 min-h-[500px] shadow-md w-[280px] shrink-0 snap-start xl:w-auto`}
                >
                  {/* Header */}
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="font-display font-extrabold text-sm dark:text-slate-200 text-slate-700">
                      {col.title}
                    </span>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500">
                      {col.items.length}
                    </span>
                  </div>

                  {/* Card items */}
                  <div className="flex-1 flex flex-col space-y-3.5 max-h-[600px] overflow-y-auto pr-1">
                    {col.items.map((comp: Complaint) => {
                      const worker = workers.find(w => w.id === comp.worker_id) || null;
                      const daysOpen = Math.round((Date.now() - new Date(comp.created_at).getTime()) / (1000 * 60 * 60 * 24));
                      const smartETA = calculateSmartETA(comp, worker);

                      return (
                        <motion.div
                          key={comp.id}
                          draggable
                          onDragStart={(e: any) => handleDragStart(e, comp.id)}
                          layoutId={comp.id}
                          onClick={() => router.push(`/admin/complaints?id=${comp.id}`)}
                          className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-300 dark:hover:border-slate-800 transition duration-150 space-y-2.5"
                        >
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
                            {comp.type} • {comp.id.substring(0, 8)}
                          </span>
                          
                          <strong className="text-xs font-bold block truncate dark:text-slate-200 text-slate-700 leading-snug">
                            {comp.title}
                          </strong>

                          <div className="flex items-center text-[10px] text-slate-400 truncate">
                            <MapPin className="w-3.5 h-3.5 mr-0.5 text-primary shrink-0" />
                            {comp.address}
                          </div>

                          <div className="flex justify-between items-center text-[10px] pt-1.5 border-t border-slate-100 dark:border-slate-800">
                            <span className="flex items-center text-slate-400 font-mono">
                              <Clock className="w-3 h-3 mr-0.5" />
                              {daysOpen}d open
                            </span>
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-200 flex items-center">
                              <DollarSign className="w-3 h-3 text-slate-400" />
                              {((comp.budget_estimated || 0) / 1000).toFixed(1)}k
                            </span>
                          </div>

                          {/* SMART ETA BADGE */}
                          {comp.status !== "pending" && comp.status !== "resolved" && (
                            <div className="p-1 rounded bg-primary/10 border border-primary/20 text-[9.5px] text-primary flex items-center justify-center font-bold font-mono">
                              <Sparkles className="w-3 h-3 mr-1 animate-pulse" />
                              <span>Est. Completion: {smartETA}</span>
                            </div>
                          )}

                          {/* Assigned worker display */}
                          {worker && (
                            <div className="flex items-center space-x-1.5 pt-1">
                              <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[9px] text-slate-500">
                                <HardHat className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-[10px] text-slate-400 truncate font-semibold">
                                {worker.name}
                              </span>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* GANTT TIMELINE TIMELINE VIEW */
          <div className="p-6 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
            <div>
              <h3 className="font-display font-extrabold text-base md:text-lg mb-1">State Project Timelines</h3>
              <p className="text-xs text-slate-400">Road repair scheduling, start-to-finish Gantt timelines</p>
            </div>

            <div className="space-y-6">
              {projects.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No active projects available.</p>
              ) : (
                projects.map((proj) => {
                  const start = new Date(proj.start_date);
                  const end = new Date(proj.end_date);
                  const durationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                  
                  // Calculate progress percentage based on complaint resolution
                  const projComps = complaints.filter(c => proj.complaint_ids.includes(c.id));
                  const resolvedCount = projComps.filter(c => c.status === "resolved").length;
                  const progressPercent = projComps.length > 0 ? (resolvedCount / projComps.length) * 100 : 0;

                  return (
                    <div key={proj.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center pb-6 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                      {/* Project info card */}
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block font-bold">
                          {proj.district} • {proj.id.substring(0, 8)}
                        </span>
                        <strong className="text-sm font-extrabold block dark:text-slate-200 text-slate-700">
                          {proj.title}
                        </strong>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          Duration: {durationDays} Days ({proj.start_date} to {proj.end_date})
                        </span>
                      </div>

                      {/* Progress bar info */}
                      <div className="md:col-span-2 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Project Progress</span>
                          <span className="font-bold text-success">{Math.round(progressPercent)}% Done ({resolvedCount}/{projComps.length} cases)</span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-gradient-to-r from-success to-emerald-400"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Budget / action stats */}
                      <div className="flex flex-row md:flex-col justify-between items-center md:items-end text-xs space-y-1">
                        <div>
                          <span className="text-[10px] text-slate-400 block md:text-right">Project Budget</span>
                          <strong className="font-mono text-slate-700 dark:text-slate-200 text-sm">
                            ₹{proj.budget_total.toLocaleString()}
                          </strong>
                        </div>
                        <button
                          onClick={() => router.push(`/admin/map`)}
                          className="py-1 px-3 border border-slate-200 dark:border-slate-800 hover:bg-slate-900 rounded-lg text-[10.5px] font-bold transition flex items-center"
                        >
                          <span>View on Map</span>
                          <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
