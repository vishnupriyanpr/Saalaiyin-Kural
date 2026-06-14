"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Camera, Upload, MapPin, Sparkles, AlertCircle, ArrowRight,
  ArrowLeft, CheckCircle, Clock, Check, RefreshCw, Smartphone
} from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { db } from "@/lib/db";
import { api } from "@/lib/api";
import { useRequireAuth, getStoredUser, getToken } from "@/lib/useAuth";
import { useWebSocket } from "@/lib/useWebSocket";
import DynamicMap from "@/components/shared/DynamicMap";
import confetti from "canvas-confetti";
import { get, set } from "idb-keyval";

export default function CivilianReport() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession] = useState<any>(null);

  // Stepper state: 1 (Photo) -> 2 (Details) -> 3 (Review)
  const [step, setStep] = useState(1);
  const [loadingAI, setLoadingAI] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Form states
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiError, setAiError] = useState(false);
  
  // Track the just-submitted complaint so its status can update live before
  // the user navigates away.
  const [submitted, setSubmitted] = useState<{ id: string; status: string } | null>(null);

  const handleRealtime = React.useCallback((payload: any) => {
    if (payload?.type === "COMPLAINT_UPDATE" && payload.complaintId) {
      setSubmitted((prev) =>
        prev && prev.id === payload.complaintId
          ? { ...prev, status: payload.status }
          : prev
      );
    }
  }, []);
  useWebSocket(handleRealtime);

  const [issueType, setIssueType] = useState("pothole");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState({
    lat: 11.0168,
    lng: 76.9558,
    address: "Coimbatore, RS Puram, Coimbatore - 641002"
  });

  // Check online status and setup sync queue
  useEffect(() => {
    setSession(getStoredUser());

    setIsOnline(navigator.onLine);

    const handleOnline = async () => {
      setIsOnline(true);
      // Sync offline queue
      const queue: any[] = (await get("saalaikural_offline_queue")) || [];
      if (queue.length > 0) {
        for (const item of queue) {
          await db.createComplaint(item);
        }
        await set("saalaikural_offline_queue", []);
        alert(`Synced ${queue.length} reports successfully from your offline database!`);
        confetti({ particleCount: 100, spread: 80 });
      }
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [router]);

  // AI image analysis via our backend
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);

    // Read file base64 for local preview
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(reader.result as string);
      triggerAIAnalysis(file);
    };
    reader.readAsDataURL(file);
  };

  // Map the model's class label to one of our issue-category options.
  const toIssueType = (label: string) => {
    const s = String(label).toLowerCase();
    if (s.includes("pothole")) return "pothole";
    if (s.includes("crack")) return "crack";
    if (s.includes("water")) return "waterlogging";
    if (s.includes("sign")) return "signage";
    return "other";
  };

  const triggerAIAnalysis = async (fileToAnalyze: File) => {
    setLoadingAI(true);
    setAiAnalysis(null);
    setAiError(false);

    try {
      const formData = new FormData();
      formData.append("image", fileToAnalyze);

      // Real ML-server contract (via /api/analyze):
      // { detections:[{type,confidence,severity,bbox}], overall_severity,
      //   priority_score (1-10), road_condition, recommended_action, photo_url }
      const res: any = await api.upload("/api/analyze", formData, getToken() || undefined);

      const dets: any[] = Array.isArray(res.detections) ? res.detections : [];
      const top = [...dets].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
      const sev10 = Math.max(1, Math.round(Number(res.priority_score) || 0));

      const analysisData = {
        detected_label: top?.type ? String(top.type) : null,
        type: top?.type ? toIssueType(top.type) : issueType,
        detections: dets,
        detection_count: dets.length,
        overall_severity: res.overall_severity || "none",
        road_condition: res.road_condition || (dets.length ? "Damage detected" : "No visible damage detected"),
        recommended_action: res.recommended_action || "review",
        severity_score: sev10,
        confidence: top?.confidence ?? 0,
        estimated_cost: sev10 * 1500,
        recommended_points: sev10 * 20,
        photo_url: res.photo_url || null,
      };

      setAiAnalysis(analysisData);
      // Only override the user's chosen category when the model actually detected something.
      if (top?.type) setIssueType(analysisData.type);

      if (analysisData.photo_url) {
        const base = process.env.NEXT_PUBLIC_API_URL || "";
        const url: string = analysisData.photo_url;
        setPhoto(url.startsWith("http") ? url : `${base}${url}`);
      }
    } catch (err) {
      console.error("AI Analysis error:", err);
      // No fabrication — surface a real error. The user can still file manually.
      setAiAnalysis(null);
      setAiError(true);
    } finally {
      setLoadingAI(false);
    }
  };

  // Location auto capture
  const captureGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            address: `📍 Coimbatore, RS Puram • ${pos.coords.latitude.toFixed(4)}°N ${pos.coords.longitude.toFixed(4)}°E`
          });
        },
        () => {
          // fallback default Coimbatore coords
          setLocation({
            lat: 11.0168,
            lng: 76.9558,
            address: "📍 Coimbatore, RS Puram • 11.0168°N 76.9558°E"
          });
        }
      );
    }
  };

  // Trigger GPS on step 2 load
  useEffect(() => {
    if (step === 2) {
      captureGPS();
    }
  }, [step]);

  const handleMapLocationSelect = (lat: number, lng: number, address: string) => {
    setLocation({ lat, lng, address });
  };

  const handleSubmit = async () => {
    if (!session) return;

    const newComplaint = {
      civilian_id: session.userId,
      title: `${issueType.toUpperCase()} reported on ${location.address.split("•")[0]}`,
      type: issueType as any,
      description: description || `Defect reported at Coimbatore`,
      photo_url: photo || "",
      photo_metadata: {
        depth_est: aiAnalysis?.depth_est || "8cm",
        reference_object: "Car tyre shadow",
        shadow_analyzed: true
      },
      lat: location.lat,
      lng: location.lng,
      address: location.address,
      district: session.district || "Coimbatore",
      severity: (aiAnalysis?.severity_score >= 8 ? "critical" : aiAnalysis?.severity_score >= 6 ? "high" : "medium") as "low" | "medium" | "high" | "critical",
      ai_classification: aiAnalysis || {
        type: issueType,
        severity_score: 5,
        confidence: 0.85,
        estimated_cost: 9000,
        recommended_points: 120
      },
      status: "pending" as const,
      points_awarded: 0,
      budget_estimated: aiAnalysis?.estimated_cost || 9000,
      budget_actual: null
    };

    try {
      if (!isOnline) {
        // Queue inside IndexedDB
        const queue: any[] = (await get("saalaikural_offline_queue")) || [];
        queue.push(newComplaint);
        await set("saalaikural_offline_queue", queue);
        alert("Offline Mode Active! Your report has been saved locally and will auto-sync once internet returns.");
        router.push("/civilian/dashboard");
        return;
      }

      // Critical step: create the complaint. Only a failure here counts as a
      // failed submission.
      const created = await db.createComplaint(newComplaint);
      if (created?.id) setSubmitted({ id: created.id, status: created.status || "pending" });
    } catch (err) {
      console.error("Failed to create complaint:", err);
      alert("Failed to submit complaint.");
      return;
    }

    // Post-create side-effects (point award, notification, confetti) are best
    // effort — a failure here (e.g. a 404 on the point-award) must NOT mark the
    // submission as failed since the complaint already exists.
    try {
      // Award immediate submit points (+10), advance the daily streak, and
      // unlock streak/first-report achievement badges.
      const civ = await db.getCivilianById(session.userId);
      if (civ) {
        const today = new Date();
        const todayStr = today.toISOString().split("T")[0];
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const yStr = yesterday.toISOString().split("T")[0];

        let newStreak: number;
        if (civ.last_report_date === todayStr) newStreak = Math.max(civ.streak_days || 0, 1);
        else if (civ.last_report_date === yStr) newStreak = (civ.streak_days || 0) + 1;
        else newStreak = 1;

        const newBadges = Array.isArray(civ.badges) ? [...civ.badges] : [];
        if (!newBadges.includes("First Report")) newBadges.push("First Report");
        if (newStreak >= 7 && !newBadges.includes("7-Day Streak")) newBadges.push("7-Day Streak");

        await db.updateCivilian(civ.id, {
          points_total: civ.points_total + 10,
          last_report_date: todayStr,
          streak_days: newStreak,
          badges: newBadges
        });

        // Trigger point gain notification
        await db.createNotification({
          target_role: "civilian",
          target_id: civ.id,
          title: "Report Submitted! +10 PTS 🎉",
          body: "Defect submitted for review. Get up to +250 points when verified by district admins!",
          type: "point_gain"
        });
      }

      // Success confetti triggers
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
    } catch (sideEffectErr) {
      // Log but do not fail the submission.
      console.error("Post-submit side-effect failed (complaint was still created):", sideEffectErr);
    }

    // Complaint created => always treat as success.
    router.push("/civilian/dashboard");
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4">
        <div className="w-40 h-6 rounded bg-slate-200 animate-pulse" />
        <div className="w-64 h-40 rounded-2xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark text-slate-800 dark:text-slate-100 flex flex-col transition-colors pb-16">
      <Navbar portal="civilian" userName={session?.name} />

      <main className="flex-1 max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-3xl w-full mx-auto px-4 md:px-6 lg:px-8 mt-6">
        
        {/* Connection status indicator */}
        {!isOnline && (
          <div className="p-3 mb-4 rounded-xl bg-warning/10 border border-warning/20 text-warning text-xs font-semibold flex items-center space-x-2 animate-pulse">
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>Working Offline. Reports queue in browser memory and sync automatically.</span>
          </div>
        )}

        {/* Form stepper card */}
        <div className="p-6 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
          
          {/* Stepper tracker */}
          <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display font-black text-base md:text-lg dark:text-white text-secondary">
              Report Damage (புகார் அளிக்கவும்)
            </h2>
            <div className="flex items-center space-x-1 text-xs font-mono">
              <span className={`px-2 py-0.5 rounded ${step === 1 ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-900"}`}>1</span>
              <span className="text-slate-500">&rarr;</span>
              <span className={`px-2 py-0.5 rounded ${step === 2 ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-900"}`}>2</span>
              <span className="text-slate-500">&rarr;</span>
              <span className={`px-2 py-0.5 rounded ${step === 3 ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-900"}`}>3</span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            
            {/* STEP 1: PHOTO CAPTURE */}
            {step === 1 && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                key="step-1"
                className="space-y-5"
              >
                <div>
                  <h3 className="font-display font-extrabold text-sm dark:text-slate-200 text-slate-700">Step 1: Defect Evidence</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Upload a picture of the damage. AI classifies type & severity.</p>
                </div>

                <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center hover:border-primary transition duration-150 relative bg-slate-50/20">
                  <input
                    type="file"
                    accept="image/*"
                    id="camera-input"
                    onChange={handlePhotoUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {photo ? (
                    <img
                      src={photo}
                      alt="Uploaded proof preview"
                      className="max-h-48 mx-auto rounded-xl object-cover"
                    />
                  ) : (
                    <div className="space-y-3 py-6">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
                        <Camera className="w-6 h-6" />
                      </div>
                      <div className="text-xs">
                        <span className="font-bold text-primary block">Take photo or upload file</span>
                        <span className="text-slate-400 text-[10.5px] mt-0.5 block">Supports JPG, PNG (Max 5MB)</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Classifier result loader */}
                {loadingAI && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-center space-x-2">
                    <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-xs font-mono font-bold text-slate-500">Saalai Kural AI Analyzing...</span>
                  </div>
                )}

                {aiAnalysis && (
                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 space-y-2 glow-xp">
                    <div className="flex items-center space-x-1 text-primary font-bold text-xs uppercase tracking-wider font-mono">
                      <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                      <span>AI Triage diagnosis</span>
                    </div>
                    <div className="text-xs space-y-1 text-slate-600 dark:text-slate-300">
                      {aiAnalysis.detection_count > 0 ? (
                        <>
                          <p>Detected: <strong className="capitalize text-slate-800 dark:text-white font-bold">{(aiAnalysis.detected_label || aiAnalysis.type).replace(/_/g, " ")}</strong>{aiAnalysis.detection_count > 1 && <span className="text-slate-400"> (+{aiAnalysis.detection_count - 1} more)</span>}</p>
                          <p>Confidence: <strong className="font-mono text-slate-800 dark:text-white">{Math.round((aiAnalysis.confidence || 0) * 100)}%</strong></p>
                          <p>Severity: <strong className="font-mono capitalize text-slate-800 dark:text-white">{aiAnalysis.overall_severity}</strong> <span className="text-slate-400">({aiAnalysis.severity_score}/10)</span></p>
                          <p>Road condition: <strong className="capitalize text-slate-800 dark:text-white">{String(aiAnalysis.road_condition).replace(/_/g, " ")}</strong></p>
                          <p>Recommended action: <strong className="capitalize text-slate-800 dark:text-white">{String(aiAnalysis.recommended_action).replace(/_/g, " ")}</strong></p>
                          <p>Points reward potential: <strong className="text-primary font-bold">+{aiAnalysis.recommended_points} PTS</strong></p>
                        </>
                      ) : (
                        <p className="text-slate-500">No visible road damage detected by the model. You can still file this report — an officer will review it.</p>
                      )}
                    </div>
                  </div>
                )}

                {aiError && (
                  <div className="p-3 rounded-xl border border-warning/30 bg-warning/10 text-warning text-xs font-semibold flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>AI analysis is unavailable right now. You can still continue and file the report manually.</span>
                  </div>
                )}

                <button
                  onClick={() => setStep(2)}
                  disabled={!photo || loadingAI}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-orange-500 hover:from-primary-hover hover:to-orange-600 text-white font-bold text-sm shadow-lg shadow-primary/10 transition duration-150 flex items-center justify-center space-x-1.5 disabled:opacity-40"
                >
                  <span>Continue to Details</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {/* STEP 2: DETAILS CAPTURE */}
            {step === 2 && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                key="step-2"
                className="space-y-4"
              >
                <div>
                  <h3 className="font-display font-extrabold text-sm dark:text-slate-200 text-slate-700">Step 2: Log Specifications</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Verify coordinates and enter defect notes.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block">Issue Category</label>
                  <select
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none"
                  >
                    <option value="pothole">Pothole (சாலை குழி)</option>
                    <option value="crack">Road Cracking (விரிசல்)</option>
                    <option value="waterlogging">Waterlogging (தேங்கிய நீர்)</option>
                    <option value="signage">Broken Signage (சேதமடைந்த பலகை)</option>
                    <option value="other">Other Defect (இதர சேதம்)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block">Description (Max 200 chars)</label>
                  <textarea
                    maxLength={200}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide neighborhood landmarks, direction, width descriptors..."
                    rows={3}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-primary resize-none"
                  />
                </div>

                {/* GPS Coordinates Preview */}
                <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 text-xs">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">GPS Captured coordinates</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center">
                    <MapPin className="w-3.5 h-3.5 mr-1 text-primary shrink-0 animate-bounce" />
                    {location.address}
                  </span>
                  <span className="text-[9px] text-slate-400 block font-mono">
                    Lat/Lng: {location.lat.toFixed(6)}°N, {location.lng.toFixed(6)}°E
                  </span>
                </div>

                {/* Mini Coordinates Map Picker */}
                <div className="h-32 md:h-48 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                  <DynamicMap
                    center={[location.lat, location.lng]}
                    zoom={15}
                    interactive={true}
                    onLocationSelect={handleMapLocationSelect}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 transition flex items-center justify-center"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="flex-[2] py-2.5 rounded-xl bg-gradient-to-r from-primary to-orange-500 hover:from-primary-hover hover:to-orange-600 text-white font-bold text-xs shadow-lg shadow-primary/10 transition duration-150 flex items-center justify-center space-x-1"
                  >
                    <span>Next Review</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: REVIEW & SUBMIT */}
            {step === 3 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                key="step-3"
                className="space-y-5"
              >
                <div>
                  <h3 className="font-display font-extrabold text-sm dark:text-slate-200 text-slate-700">Step 3: Verification</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Please review your case details before submission.</p>
                </div>

                {/* Summary card */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 space-y-4">
                  <div className="flex items-center space-x-3">
                    {photo && (
                      <img
                        src={photo}
                        alt="defects preview"
                        className="w-14 h-14 rounded-lg object-cover border border-slate-200"
                      />
                    )}
                    <div>
                      <strong className="text-xs font-extrabold block dark:text-slate-200 text-slate-700 leading-tight capitalize">
                        {issueType}
                      </strong>
                      <span className="text-[10px] text-slate-400 font-mono mt-0.5 block truncate max-w-[180px]">
                        Address: {location.address.split("•")[0]}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono uppercase">Notes:</span>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-sans">{description || "No defect notes entered"}</p>
                    </div>
                    {aiAnalysis && (
                      <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-slate-400">Estimated Review Reward:</span>
                        <strong className="text-primary font-mono">+{aiAnalysis.recommended_points} PTS</strong>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 transition flex items-center justify-center"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" /> Adjust
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="flex-[2] py-2.5 rounded-xl bg-gradient-to-r from-primary to-orange-500 hover:from-primary-hover hover:to-orange-600 text-white font-bold text-xs shadow-lg shadow-primary/20 transition flex items-center justify-center space-x-1.5"
                  >
                    <CheckCircle className="w-5 h-5 animate-pulse" />
                    <span>File Safe Report</span>
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>

        </div>

      </main>
    </div>
  );
}
