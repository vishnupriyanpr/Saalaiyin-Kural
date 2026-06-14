"use client";

import React, { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  CheckCircle2, Circle, Clock, Loader2, Star, AlertCircle, ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/shared/Navbar";
import { api } from "@/lib/api";
import { db } from "@/lib/db";
import { useRequireAuth, getStoredUser, getToken } from "@/lib/useAuth";
import { useWebSocket } from "@/lib/useWebSocket";
import type { TimelineStep, Complaint } from "@/lib/types";

// Canonical 4-step lifecycle shown in the stepper.
const STEP_ORDER = [
  { key: "reported", label: "Reported", statuses: ["pending"] },
  { key: "under_review", label: "Under Review", statuses: ["verified", "under_review"] },
  { key: "in_progress", label: "Work In Progress", statuses: ["assigned", "in_progress"] },
  { key: "resolved", label: "Resolved", statuses: ["resolved"] },
];

function stepIndexForStatus(status: string): number {
  const idx = STEP_ORDER.findIndex((s) => s.statuses.includes(status));
  return idx === -1 ? 0 : idx;
}

function TrackContent() {
  const { ready } = useRequireAuth();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [session, setSession] = useState<any>(null);
  const [timeline, setTimeline] = useState<TimelineStep[]>([]);
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Feedback form
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const [tl, comp] = await Promise.all([
        api.get<TimelineStep[]>(`/api/complaints/${id}/timeline`, getToken() || undefined),
        db.getComplaintById(id),
      ]);
      setTimeline(Array.isArray(tl) ? tl : []);
      setComplaint(comp);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    setSession(getStoredUser());
    load();
  }, [ready, load]);

  // Live: refresh the timeline when this complaint changes.
  const handleRealtime = useCallback(
    (payload: any) => {
      if (
        payload?.type === "COMPLAINT_UPDATE" &&
        id &&
        payload.complaintId === id
      ) {
        load();
      }
    },
    [id, load]
  );
  useWebSocket(handleRealtime);

  const submitFeedback = async () => {
    if (!id || rating < 1) return;
    setSubmittingFeedback(true);
    try {
      await api.post(
        `/api/complaints/${id}/feedback`,
        { rating, comment },
        getToken() || undefined
      );
      setFeedbackDone(true);
    } catch (e) {
      console.error(e);
      alert("Failed to submit feedback. Please try again.");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const currentStatus = complaint?.status || "pending";
  const activeStep = stepIndexForStatus(currentStatus);
  const isResolved = currentStatus === "resolved";

  // Map a step config to the timeline event (if the backend supplied one).
  const stepData = STEP_ORDER.map((cfg) => {
    const match = timeline.find(
      (t) => cfg.statuses.includes(t.status) || t.step?.toLowerCase().includes(cfg.key)
    );
    return { ...cfg, event: match };
  });

  const proofImage = complaint?.photo_metadata && (complaint as any)?.proof_image_url
    ? (complaint as any).proof_image_url
    : (complaint as any)?.resolution_proof_url || null;

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Loading timeline…</p>
      </div>
    );
  }

  if (error || !id) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar portal="civilian" userName={session?.name} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <AlertCircle className="w-9 h-9 text-red-500" />
          <p className="text-sm font-semibold text-slate-700">
            {id ? "Could not load this complaint's timeline." : "No complaint id provided."}
          </p>
          <div className="flex gap-2">
            {id && (
              <button onClick={load} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md">
                Retry
              </button>
            )}
            <Link href="/civilian/dashboard" className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 text-sm font-bold">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col pb-16">
      <Navbar portal="civilian" userName={session?.name} />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 md:px-6 mt-6 space-y-6">
        <Link href="/civilian/dashboard" className="inline-flex items-center text-xs font-mono text-slate-400 hover:text-primary transition">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to dashboard
        </Link>

        {/* Header */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Complaint Tracking</span>
          <h1 className="text-xl font-display font-black text-secondary mt-1 truncate">
            {complaint?.title || `Complaint ${id}`}
          </h1>
          {complaint?.address && (
            <p className="text-xs text-slate-400 mt-1">{complaint.address}</p>
          )}
          <span className="inline-block mt-3 px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-primary/10 text-primary capitalize">
            {currentStatus.replace("_", " ")}
          </span>
        </div>

        {/* Vertical stepper */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <h2 className="font-display font-bold text-sm mb-5">Progress Timeline</h2>
          <ol className="relative">
            {stepData.map((s, i) => {
              const done = i < activeStep || (i === activeStep && isResolved);
              const current = i === activeStep && !isResolved;
              const isLast = i === stepData.length - 1;
              return (
                <li key={s.key} className="relative pl-10 pb-8 last:pb-0">
                  {/* connector */}
                  {!isLast && (
                    <span
                      className={`absolute left-[15px] top-7 bottom-0 w-0.5 ${
                        done ? "bg-emerald-400" : "bg-slate-200"
                      }`}
                    />
                  )}
                  {/* dot */}
                  <span className="absolute left-0 top-0">
                    {done ? (
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 bg-white rounded-full" />
                    ) : current ? (
                      <motion.span
                        animate={{ scale: [1, 1.15, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                        className="block"
                      >
                        <Clock className="w-8 h-8 text-amber-500 bg-white rounded-full" />
                      </motion.span>
                    ) : (
                      <Circle className="w-8 h-8 text-slate-300 bg-white rounded-full" />
                    )}
                  </span>

                  <div className={current ? "" : done ? "" : "opacity-50"}>
                    <h3 className="text-sm font-bold text-slate-800">{s.label}</h3>
                    {s.event?.timestamp && (
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                        {new Date(s.event.timestamp).toLocaleString("en-IN")}
                      </span>
                    )}
                    {s.event?.notes && (
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.event.notes}</p>
                    )}
                    {!s.event && current && (
                      <p className="text-xs text-amber-600 mt-1">In progress…</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Resolved: proof image + feedback */}
        {isResolved && (
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
            <div className="flex items-center space-x-2 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
              <h2 className="font-display font-bold text-sm">Repair Completed</h2>
            </div>

            {proofImage && (
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400 block mb-2">Proof of repair</span>
                <img
                  src={proofImage}
                  alt="Repair proof"
                  className="w-full max-h-64 object-cover rounded-xl border border-slate-200"
                />
              </div>
            )}

            {feedbackDone ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center text-sm text-emerald-700 font-semibold">
                Thank you for your feedback!
              </div>
            ) : (
              <div className="space-y-3">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Rate the resolution</span>
                <div className="flex items-center space-x-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-0.5"
                      aria-label={`${n} star`}
                    >
                      <Star
                        className={`w-7 h-7 transition ${
                          (hoverRating || rating) >= n
                            ? "text-amber-400 fill-amber-400"
                            : "text-slate-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Tell us about the repair quality…"
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-primary resize-none"
                />
                <button
                  onClick={submitFeedback}
                  disabled={rating < 1 || submittingFeedback}
                  className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-bold shadow-md transition disabled:opacity-40 flex items-center justify-center"
                >
                  {submittingFeedback ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Submit Feedback"
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
