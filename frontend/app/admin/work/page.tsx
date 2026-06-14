"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  HardHat, MapPin, AlertCircle, Sparkles, UserCheck, Phone, Check,
  Clock, ShieldAlert, BadgeCheck, HelpCircle, Star
} from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { db } from "@/lib/db";
import { Complaint, Worker } from "@/lib/types";
import { useRequireAuth, getStoredUser } from "@/lib/useAuth";

// AI Recommendation Engine
function getBestWorkerForComplaint(comp: Complaint, workersList: Worker[], complaintsList: Complaint[]): Worker | null {
  // 1. Filter workers in same district
  const districtWorkers = workersList.filter(w => w.district === comp.district && w.availability === "available");
  if (districtWorkers.length === 0) return null;

  // 2. Identify skills matching complaint type
  const typeSkillMapping: any = {
    pothole: "Pothole Repair",
    crack: "Crack Sealing",
    waterlogging: "Water Drainage",
    signage: "Signage",
    other: "Road Laying"
  };
  const requiredSkill = typeSkillMapping[comp.type] || "Road Laying";

  // 3. Score workers based on matching skills and current assignment load
  const scoredWorkers = districtWorkers.map(worker => {
    const hasSkill = worker.skill_tags.includes(requiredSkill);
    const activeAssignments = complaintsList.filter(c => c.worker_id === worker.id && c.status !== "resolved").length;
    
    // Score formula: (hasSkill ? 100 : 0) - (activeAssignments * 20) + (worker.rating * 5)
    const score = (hasSkill ? 100 : 0) - (activeAssignments * 20) + (worker.rating * 5);
    
    return { worker, score };
  });

  // 4. Sort and pick highest score
  scoredWorkers.sort((a, b) => b.score - a.score);
  return scoredWorkers[0]?.worker || null;
}

export default function WorkAllocation() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession] = useState<any>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Dragging states
  const [draggedCompId, setDraggedCompId] = useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [comps, wrks] = await Promise.all([
        db.getComplaints(),
        db.getWorkers(),
      ]);
      setComplaints(comps);
      setWorkers(wrks);
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

  const handleDragStart = (e: any, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    setDraggedCompId(id);
  };

  const handleDragEnd = () => {
    setDraggedCompId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, workerId: string) => {
    e.preventDefault();
    const compId = e.dataTransfer.getData("text/plain");
    if (!compId) return;

    try {
      const comp = complaints.find(c => c.id === compId);
      const worker = workers.find(w => w.id === workerId);
      
      if (!comp || !worker) return;

      // Update complaint status & worker ID
      await db.updateComplaint(compId, {
        status: "assigned",
        worker_id: workerId
      });

      // Notify citizen
      await db.createNotification({
        target_role: "civilian",
        target_id: comp.civilian_id,
        title: "Repair Crew Allocated 🚧",
        body: `Your report of '${comp.title}' has been dispatched. Repair contractor: ${worker.name}.`,
        type: "complaint_update"
      });

      // Notify admin
      await db.createNotification({
        target_role: "admin",
        title: "Work Allocated 📋",
        body: `Defect '${comp.title}' assigned to worker '${worker.name}'.`,
        type: "work_assign"
      });

      setDraggedCompId(null);
      alert(`Assigned complaint to ${worker.name} successfully.`);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Filter unassigned verified or pending complaints
  // Sorted by severity priority × age
  const unassignedComplaints = complaints
    .filter(c => !c.worker_id && c.status !== "resolved" && c.status !== "rejected")
    .sort((a, b) => {
      const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
      const scoreA = (severityWeight[a.severity] || 1) * (Date.now() - new Date(a.created_at).getTime());
      const scoreB = (severityWeight[b.severity] || 1) * (Date.now() - new Date(b.created_at).getTime());
      return scoreB - scoreA; // highest priority first
    });

  // Calculate current worker assignment loads
  const getWorkerLoad = (workerId: string) => {
    return complaints.filter(c => c.worker_id === workerId && c.status !== "resolved").length;
  };

  // Find AI recommended worker for the currently dragged complaint
  const activeDraggedComp = draggedCompId ? complaints.find(c => c.id === draggedCompId) || null : null;
  const recommendedWorker = activeDraggedComp ? getBestWorkerForComplaint(activeDraggedComp, workers, complaints) : null;

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4">
        <Sparkles className="w-8 h-8 text-primary animate-pulse" />
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Loading work allocation…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Failed to load work allocation data.</p>
        <button onClick={fetchData} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md">Retry</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark text-slate-800 dark:text-slate-100 flex flex-col transition-colors pb-12">
      <Navbar portal="admin" userName={session?.name} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Unassigned complaints pane */}
        <div className="lg:col-span-5 p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-display font-black tracking-tight dark:text-white text-secondary">
                Verified Backlog
              </h2>
              <p className="text-[11px] text-slate-400">Unassigned defects sorted by priority score (Severity × Age)</p>
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {unassignedComplaints.length === 0 ? (
                <div className="py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center text-xs text-slate-400">
                  <UserCheck className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <span>No unassigned cases. All dispatches assigned!</span>
                </div>
              ) : (
                unassignedComplaints.map((comp) => {
                  const daysOpen = Math.round((Date.now() - new Date(comp.created_at).getTime()) / (1000 * 60 * 60 * 24));
                  const severityColors: any = {
                    low: "bg-slate-400 text-slate-800",
                    medium: "bg-blue-400 text-slate-800",
                    high: "bg-warning text-white",
                    critical: "bg-danger text-white animate-pulse"
                  };

                  return (
                    <motion.div
                      key={comp.id}
                      draggable
                      onDragStart={(e: any) => handleDragStart(e, comp.id)}
                      onDragEnd={handleDragEnd}
                      layoutId={comp.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-300 dark:hover:border-slate-800 transition duration-150 space-y-2 relative"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">
                          {comp.type} • {comp.id.substring(0, 8)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${severityColors[comp.severity]}`}>
                          {comp.severity}
                        </span>
                      </div>

                      <strong className="text-xs font-bold block truncate dark:text-slate-200 text-slate-700 leading-snug">
                        {comp.title}
                      </strong>

                      <div className="flex items-center text-[10px] text-slate-400 truncate">
                        <MapPin className="w-3.5 h-3.5 mr-0.5 text-primary shrink-0" />
                        {comp.address}
                      </div>

                      <div className="flex justify-between items-center text-[10.5px] pt-1.5 border-t border-slate-100 dark:border-slate-800 text-slate-400">
                        <span className="flex items-center font-mono">
                          <Clock className="w-3 h-3 mr-0.5" />
                          {daysOpen} days old
                        </span>
                        <span className="font-mono text-slate-700 dark:text-slate-300 font-bold">
                          ₹{(comp.budget_estimated || 0).toLocaleString()}
                        </span>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Workers dispatch target pane */}
        <div className="lg:col-span-7 p-5 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-display font-black tracking-tight dark:text-white text-secondary">
                PWD Contractors & Volunteers
              </h2>
              <p className="text-[11px] text-slate-400 font-sans">
                Drop a defect card onto a worker profile to dispatch them.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
              {workers.map((worker) => {
                const currentLoad = getWorkerLoad(worker.id);
                const isRecommended = recommendedWorker?.id === worker.id;
                
                return (
                  <div
                    key={worker.id}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, worker.id)}
                    className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between space-y-3 ${
                      isRecommended
                        ? "bg-primary/5 dark:bg-primary/10 border-primary shadow-lg ring-1 ring-primary"
                        : "bg-slate-50/50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-800"
                    }`}
                  >
                    <div>
                      {/* Recommendations tag */}
                      {isRecommended && (
                        <div className="inline-flex items-center space-x-1 p-1 rounded bg-primary/10 border border-primary/20 text-[9px] text-primary font-bold font-mono mb-2 uppercase animate-pulse">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>AI Best Match (Lowest Load)</span>
                        </div>
                      )}

                      <div className="flex justify-between items-start">
                        <div>
                          <strong className="text-xs font-bold block dark:text-slate-200 text-slate-700 leading-snug">
                            {worker.name}
                          </strong>
                          <span className="text-[9px] text-slate-500 font-mono flex items-center">
                            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 mr-0.5" />
                            Rating: {worker.rating} • {worker.is_civilian_worker ? "Civilian Contractor" : "PWD Staff"}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full font-mono font-bold text-[8.5px] uppercase ${
                          worker.availability === "available"
                            ? "bg-success-light text-success border border-success/20"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}>
                          {worker.availability}
                        </span>
                      </div>

                      {/* Skill tags */}
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {worker.skill_tags.map((skill, sIdx) => (
                          <span key={sIdx} className="text-[8.5px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] pt-3 border-t border-slate-100 dark:border-slate-800 text-slate-400">
                      <span className="font-mono">
                        Active load: <strong className="font-bold text-slate-700 dark:text-slate-200">{currentLoad} cases</strong>
                      </span>
                      <span className="flex items-center text-[9.5px] font-mono">
                        <Phone className="w-3 h-3 mr-0.5" />
                        {worker.phone}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
