"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, AlertCircle, Loader2, CheckCircle2, Upload, X, MapPin, Calendar,
} from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { db } from "@/lib/db";
import { api } from "@/lib/api";
import { Complaint } from "@/lib/types";
import { getDecodedUser, getStoredUser, getToken } from "@/lib/useAuth";
import { useWebSocket } from "@/lib/useWebSocket";

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-50 text-blue-600",
  high: "bg-amber-50 text-amber-600",
  critical: "bg-red-50 text-red-600",
};

export default function AuthorityDashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Resolve modal
  const [resolveTarget, setResolveTarget] = useState<Complaint | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auth gate: must be logged in AND role === 'authority'.
  useEffect(() => {
    const decoded = getDecodedUser();
    if (!decoded || decoded.role !== "authority") {
      router.replace("/login");
      return;
    }
    setUserId(decoded.id || decoded.userId || null);
    setSession(getStoredUser());
    setReady(true);
  }, [router]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    try {
      const all = await db.getComplaints();
      setComplaints(
        all.filter((c) => (c as any).assigned_authority_id === userId)
      );
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  // Live updates.
  const handleRealtime = useCallback((payload: any) => {
    if (payload?.type === "COMPLAINT_UPDATE" && payload.complaintId) {
      setComplaints((prev) =>
        prev.map((c) =>
          c.id === payload.complaintId ? { ...c, status: payload.status } : c
        )
      );
    } else if (payload?.type === "ASSIGNMENT" && payload.complaint?.id) {
      const incoming = payload.complaint as Complaint;
      if ((incoming as any).assigned_authority_id === userId) {
        setComplaints((prev) => {
          if (prev.some((c) => c.id === incoming.id)) {
            return prev.map((c) => (c.id === incoming.id ? { ...c, ...incoming } : c));
          }
          return [incoming, ...prev];
        });
      }
    }
  }, [userId]);
  useWebSocket(handleRealtime);

  const handleVerify = async (c: Complaint) => {
    try {
      await api.patch(`/api/complaints/${c.id}`, { status: "in_progress" }, getToken() || undefined);
      setComplaints((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, status: "in_progress" } : x))
      );
    } catch (e) {
      console.error(e);
      alert("Failed to verify complaint.");
    }
  };

  const submitResolution = async () => {
    if (!resolveTarget) return;
    if (!resolutionNotes.trim() || !proofFile) {
      alert("Please add resolution notes and a proof image.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("resolution_notes", resolutionNotes);
      fd.append("proof_image", proofFile);
      await api.upload(`/api/complaints/${resolveTarget.id}/resolve`, fd, getToken() || undefined);
      setComplaints((prev) =>
        prev.map((x) => (x.id === resolveTarget.id ? { ...x, status: "resolved" } : x))
      );
      setResolveTarget(null);
      setResolutionNotes("");
      setProofFile(null);
    } catch (e) {
      console.error(e);
      alert("Failed to submit resolution.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Loading authority queue…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col pb-16">
      <Navbar portal="admin" userName={session?.name} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 mt-6 space-y-6">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-display font-black text-secondary">Authority Work Queue</h1>
            <p className="text-xs text-slate-400">Complaints routed to you for verification and resolution.</p>
          </div>
        </div>

        {error ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <AlertCircle className="w-9 h-9 text-red-500" />
            <p className="text-sm font-semibold text-slate-700">Failed to load your assignments.</p>
            <button onClick={load} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md">Retry</button>
          </div>
        ) : complaints.length === 0 ? (
          <div className="py-20 text-center text-sm text-slate-400">
            No complaints are currently assigned to you.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {complaints.map((c) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col"
              >
                {c.photo_url && (
                  <img src={c.photo_url} alt="defect" className="w-full h-36 object-cover" />
                )}
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-start justify-between">
                    <h3 className="text-sm font-bold text-slate-800 truncate pr-2">{c.title}</h3>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${SEVERITY_COLORS[c.severity] || SEVERITY_COLORS.low}`}>
                      {c.severity}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 flex items-center mt-1 truncate">
                    <MapPin className="w-3 h-3 mr-0.5 text-primary shrink-0" /> {c.address}
                  </p>
                  <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400 font-mono">
                    <span className="capitalize">{c.type}</span>
                    <span className="flex items-center">
                      <Calendar className="w-3 h-3 mr-0.5" />
                      {new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </span>
                  </div>

                  <div className="mt-3">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-100 text-slate-500 capitalize">
                      {c.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="mt-auto pt-4 flex gap-2">
                    {c.status !== "resolved" && c.status !== "in_progress" && (
                      <button
                        onClick={() => handleVerify(c)}
                        className="flex-1 py-2 rounded-xl bg-secondary hover:bg-secondary-hover text-white text-xs font-bold transition"
                      >
                        Verify
                      </button>
                    )}
                    {c.status !== "resolved" && (
                      <button
                        onClick={() => setResolveTarget(c)}
                        className="flex-1 py-2 rounded-xl bg-success hover:bg-success-hover text-white text-xs font-bold transition flex items-center justify-center"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Resolve
                      </button>
                    )}
                    {c.status === "resolved" && (
                      <div className="flex-1 py-2 rounded-xl bg-success/10 text-success text-xs font-bold text-center">
                        Resolved
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Resolve modal */}
      <AnimatePresence>
        {resolveTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !submitting && setResolveTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[90%] max-w-md max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-base">Resolve Complaint</h2>
                <button onClick={() => setResolveTarget(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-slate-400 truncate">{resolveTarget.title}</p>

              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-slate-400 block">Resolution notes</label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                  placeholder="Describe the work completed…"
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-slate-400 block">Proof image</label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center relative hover:border-primary transition">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {proofFile ? (
                    <span className="text-xs font-semibold text-slate-700">{proofFile.name}</span>
                  ) : (
                    <span className="text-xs text-slate-400 flex items-center justify-center">
                      <Upload className="w-4 h-4 mr-1" /> Upload proof of repair
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={submitResolution}
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-success hover:bg-success-hover text-white text-sm font-bold shadow-md transition disabled:opacity-40 flex items-center justify-center"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Resolution"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
