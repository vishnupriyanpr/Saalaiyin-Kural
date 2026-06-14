"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Search, Check, X, ShieldAlert, Award, User, MapPin, 
  ChevronRight, Calendar, HardHat, DollarSign, Camera, ExternalLink, Info, AlertTriangle, AlertCircle
} from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { db } from "@/lib/db";
import { api } from "@/lib/api";
import { Complaint, CivilianUser, Worker, Road } from "@/lib/types";
import { useRequireAuth, getStoredUser, getToken } from "@/lib/useAuth";
import { useWebSocket } from "@/lib/useWebSocket";
import { motion, AnimatePresence } from "framer-motion";
import OrbitImages from "@/components/shared/OrbitImages";
import GradualBlur from "@/components/shared/GradualBlur";
import DynamicMap from "@/components/shared/DynamicMap";

// Helper to calculate distance in meters
function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Map thumbnail for records WITHOUT an uploaded photo (e.g. seeded/mock complaints,
// which carry coordinates but no image). Renders the OpenStreetMap tile covering the
// point with a centred pin, and falls back to a tinted map-ish placeholder offline.
function MapThumb({ lat, lng }: { lat: number; lng: number }) {
  const [failed, setFailed] = useState(false);
  const z = 14;
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  const valid = Number.isFinite(x) && Number.isFinite(y);
  return (
    <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 shrink-0 bg-gradient-to-br from-emerald-50 to-sky-100 dark:from-slate-800 dark:to-slate-900">
      {valid && !failed && (
        <img
          src={`https://tile.openstreetmap.org/${z}/${x}/${y}.png`}
          alt="location map"
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <MapPin className="w-3.5 h-3.5 text-primary drop-shadow" fill="currentColor" />
      </span>
    </div>
  );
}

// List thumbnail: show the uploaded defect photo, but fall back to a map-tile
// thumbnail if there's no photo OR the image fails to load. Seeded/mock complaints
// point at /uploads/sample_*.jpg which don't exist on disk (uploads is gitignored),
// so without this they rendered as broken/blank — now they get a map thumbnail.
function ComplaintThumb({ photoUrl, lat, lng }: { photoUrl?: string; lat: number; lng: number }) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt="road defect"
        onError={() => setFailed(true)}
        className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-800 shrink-0"
      />
    );
  }
  return <MapThumb lat={lat} lng={lng} />;
}

export default function AdminComplaints() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark text-slate-800 dark:text-slate-100 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        <p className="text-xs text-slate-400 mt-2 font-mono">Loading complaints database...</p>
      </div>
    }>
      <ComplaintsContent />
    </Suspense>
  );
}

function ComplaintsContent() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const searchParams = useSearchParams();
  const activeParamId = searchParams.get("id");

  const [session, setSession] = useState<any>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [civilians, setCivilians] = useState<CivilianUser[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  // Selected single complaint for drawer
  const [selectedComp, setSelectedComp] = useState<Complaint | null>(null);
  const [reporter, setReporter] = useState<CivilianUser | null>(null);
  const [road, setRoad] = useState<Road | null>(null);
  
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Tab control
  const [activeTab, setActiveTab] = useState<string>("all");
  
  // Search & Filter
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("all");

  // Drawer states
  const [overridePoints, setOverridePoints] = useState(0);
  const [assignWorkerId, setAssignWorkerId] = useState("");
  const [showLightbox, setShowLightbox] = useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [comps, civs, wrks] = await Promise.all([
        db.getComplaints(), db.getCivilians(), db.getWorkers(),
      ]);
      setComplaints(comps);
      setCivilians(civs);
      setWorkers(wrks);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load datasets
  useEffect(() => {
    if (!ready) return;
    setSession(getStoredUser());
    loadData();
  }, [ready, loadData]);

  // Sync selected complaint on URL changes or updates
  useEffect(() => {
    if (activeParamId && complaints.length > 0) {
      const found = complaints.find(c => c.id === activeParamId);
      if (found) {
        setSelectedComp(found);
        setOverridePoints(found.ai_classification?.recommended_points ?? 0);
        if (found.worker_id) {
          setAssignWorkerId(found.worker_id);
        } else {
          setAssignWorkerId("");
        }

        const rep = civilians.find(civ => civ.id === found.civilian_id);
        setReporter(rep || null);
      }
    } else {
      setSelectedComp(null);
      setReporter(null);
      setRoad(null);
    }
  }, [activeParamId, complaints, civilians]);

  // Load the road / contractor record for the selected complaint (if it has one).
  useEffect(() => {
    const roadId = (selectedComp as any)?.road_id as string | undefined;
    if (!roadId) {
      setRoad(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await db.getRoadById(roadId);
        if (!cancelled) setRoad(r);
      } catch {
        if (!cancelled) setRoad(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedComp]);

  // Live: reflect status changes and worker assignments without a full reload.
  const handleRealtime = React.useCallback((payload: any) => {
    if (payload?.type === "COMPLAINT_UPDATE" && payload.complaintId) {
      setComplaints((prev) =>
        prev.map((c) =>
          c.id === payload.complaintId ? { ...c, status: payload.status } : c
        )
      );
    } else if (payload?.type === "ASSIGNMENT" && payload.complaint?.id) {
      const updated = payload.complaint as Complaint;
      setComplaints((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
    }
  }, []);
  useWebSocket(handleRealtime);

  const selectComplaint = (id: string | null) => {
    if (id) {
      router.push(`/admin/complaints?id=${id}`);
    } else {
      router.push("/admin/complaints");
    }
  };

  // Check duplicate detector: find other complaints within 100m of same type
  const duplicateWarning = selectedComp
    ? complaints.find(
        c =>
          c.id !== selectedComp.id &&
          c.type === selectedComp.type &&
          c.status !== "resolved" &&
          c.status !== "rejected" &&
          getDistanceMeters(selectedComp.lat, selectedComp.lng, c.lat, c.lng) <= 100
      )
    : null;

  // Actions
  const handleVerify = async () => {
    if (!selectedComp) return;

    try {
      // 1. Update Complaint Status
      const updated = await db.updateComplaint(selectedComp.id, {
        status: "verified",
        points_awarded: overridePoints,
      });

      // 2. Award Points to Civilian Profile
      if (reporter) {
        const newTotalPoints = reporter.points_total + overridePoints;
        // Determine level threshold
        let level = "Rookie";
        if (newTotalPoints >= 6000) level = "Road Legend";
        else if (newTotalPoints >= 3000) level = "Guardian";
        else if (newTotalPoints >= 1500) level = "Watchdog";
        else if (newTotalPoints >= 500) level = "Reporter";

        const badges = [...reporter.badges];
        if (!badges.includes("First Report")) badges.push("First Report");
        if (newTotalPoints >= 500 && !badges.includes("Top Reporter")) badges.push("Top Reporter");

        await db.updateCivilian(reporter.id, {
          points_total: newTotalPoints,
          level,
          badges
        });

        // 3. Create Points Notification for civilian
        await db.createNotification({
          target_role: "civilian",
          target_id: reporter.id,
          title: "Complaint Verified! +Points Awarded 🏆",
          body: `Your report of '${selectedComp.title}' was verified. You have earned +${overridePoints} points!`,
          type: "point_gain"
        });
      }

      await loadData();
      alert("Complaint successfully verified. Points awarded!");
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async () => {
    if (!selectedComp) return;
    try {
      await db.updateComplaint(selectedComp.id, {
        status: "rejected",
        points_awarded: 0,
      });

      await db.createNotification({
        target_role: "civilian",
        target_id: selectedComp.civilian_id,
        title: "Report Status Update",
        body: `Your report of '${selectedComp.title}' was rejected by the reviewer. Reason: Out of jurisdiction or duplicate.`,
        type: "complaint_update"
      });

      await loadData();
      alert("Complaint marked as rejected.");
    } catch (err) {
      console.error(err);
    }
  };

  // Assign a worker through the backend assignment endpoint (admin contract).
  // Falls back to the generic complaint update if the endpoint is unavailable.
  const handleAssignWorker = async () => {
    if (!selectedComp || !assignWorkerId) return;
    const worker = workers.find(w => w.id === assignWorkerId);
    try {
      await api.post(
        `/api/complaints/${selectedComp.id}/assign`,
        { worker_id: assignWorkerId },
        getToken() || undefined
      );
      await loadData();
      alert(`Assigned PWD Worker/Contractor: ${worker?.name}`);
    } catch (err) {
      console.error("Assign endpoint failed, falling back to update:", err);
      try {
        await db.updateComplaint(selectedComp.id, {
          status: "assigned",
          worker_id: assignWorkerId,
        });
        await loadData();
        alert(`Assigned PWD Worker/Contractor: ${worker?.name}`);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleCloseCase = async () => {
    if (!selectedComp) return;
    try {
      await db.updateComplaint(selectedComp.id, {
        status: "resolved",
        budget_actual: Math.round((selectedComp.budget_estimated || 0) * 0.95), // 5% cost optimization
      });

      // Award bonus points for completion
      if (reporter) {
        await db.updateCivilian(reporter.id, {
          points_total: reporter.points_total + 50, // +50 resolve bonus
        });
        
        await db.createNotification({
          target_role: "civilian",
          target_id: reporter.id,
          title: "Road Repair Resolved! 🎉 +50 PTS Bonus",
          body: `Repair completed for '${selectedComp.title}'. Thank you for your civic contribution. Your eco bonus is ready!`,
          type: "complaint_update"
        });
      }

      await loadData();
      alert("Complaint marked as resolved. Repair complete.");
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedIds.length === 0) return;
    const workerId = prompt("Enter Worker ID (e.g. wrk-111, wrk-222, wrk-333):");
    if (!workerId) return;

    try {
      for (const id of selectedIds) {
        await db.updateComplaint(id, {
          status: "assigned",
          worker_id: workerId,
        });
      }
      setSelectedIds([]);
      await loadData();
      alert(`Successfully assigned ${selectedIds.length} complaints in bulk.`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkClose = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to resolve ${selectedIds.length} cases?`)) return;

    try {
      for (const id of selectedIds) {
        const comp = complaints.find(c => c.id === id);
        await db.updateComplaint(id, {
          status: "resolved",
          budget_actual: comp ? Math.round((comp.budget_estimated || 0) * 0.95) : 10000,
        });
      }
      setSelectedIds([]);
      await loadData();
      alert(`Successfully resolved ${selectedIds.length} cases in bulk.`);
    } catch (err) {
      console.error(err);
    }
  };

  // Filter complaints
  const filtered = complaints.filter(c => {
    const matchesTab = activeTab === "all" || c.status === activeTab;
    const matchesDistrict = district === "all" || c.district === district;
    const matchesSearch = 
      c.title.toLowerCase().includes(search.toLowerCase()) || 
      c.address.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase());
    
    return matchesTab && matchesDistrict && matchesSearch;
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(f => f.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(i => i !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  // ── Recent Reporters pre-computation ─────────────────
  const recentComplaints = [...complaints]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  const orbitAvatarUrls = recentComplaints.map(
    (c) =>
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
        civilians.find((cv) => cv.id === c.civilian_id)?.full_name ?? c.civilian_id
      )}&backgroundColor=FF6B2C,1A3A5C,16A34A,D97706,DC2626,7C3AED&backgroundType=gradientLinear&fontSize=40&fontWeight=700`
  );

  const recentReporters = recentComplaints.map((c) => ({
    complaint: c,
    civilian: civilians.find((cv) => cv.id === c.civilian_id),
  }));

  const pendingCount = complaints.filter((c) => c.status === "pending").length;

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
        <AlertTriangle className="w-10 h-10 text-red-500" />
        <p className="text-sm font-semibold text-slate-700">Failed to load complaints.</p>
        <button onClick={loadData} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md">Retry</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark text-slate-800 dark:text-slate-100 flex flex-col transition-colors pb-12">
      <Navbar portal="admin" userName={session?.name} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 mt-6 space-y-6">

        {/* ── Recent Reporters Orbit Banner ───────────────── */}
        {complaints.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 180, damping: 22 }}
            className="relative rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: "rgba(15, 23, 42, 0.3)", // Transparent dark tint for glass
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {/* Noise texture overlay */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")", backgroundSize: "200px" }}
            />
            {/* Liquidmorphism Background Blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-60 mix-blend-screen">
              {/* Saffron liquid blob */}
              <div 
                className="absolute left-[-10%] top-[-20%] w-[500px] h-[500px] blur-3xl opacity-80"
                style={{
                  background: "radial-gradient(circle at center, #c45c0a 0%, #e07b1a 40%, transparent 80%)",
                  animation: "liquid-morph 15s ease-in-out infinite, liquid-float-1 20s infinite alternate"
                }}
              />
              {/* Forest green liquid blob */}
              <div 
                className="absolute right-[-10%] bottom-[-20%] w-[600px] h-[600px] blur-3xl opacity-80"
                style={{
                  background: "radial-gradient(circle at center, #1a6b3c 0%, #0f4d2a 40%, transparent 80%)",
                  animation: "liquid-morph 18s ease-in-out infinite reverse, liquid-float-2 25s infinite alternate"
                }}
              />
              {/* Bright accent blob */}
              <div 
                className="absolute left-[30%] top-[40%] w-[300px] h-[300px] blur-3xl opacity-50"
                style={{
                  background: "radial-gradient(circle at center, #f59e0b 0%, transparent 70%)",
                  animation: "liquid-morph 12s ease-in-out infinite, liquid-float-1 15s infinite alternate-reverse"
                }}
              />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 p-6 md:p-8">

              {/* Left — Orbit (LARGE) */}
              <div className="shrink-0 w-full md:w-[420px]">
                <OrbitImages
                  images={orbitAvatarUrls}
                  shape="ellipse"
                  radiusX={550}
                  radiusY={130}
                  rotation={-5}
                  duration={22}
                  itemSize={96}
                  responsive
                  baseWidth={1200}
                  easing="linear"
                  centerContent={
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-4xl font-black text-white font-display tabular-nums drop-shadow-lg">{pendingCount}</span>
                      <span className="text-[9px] text-white/60 font-mono uppercase tracking-widest mt-1">Pending</span>
                    </div>
                  }
                />
              </div>

              {/* Right — Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-amber-200/60">Live Reporter Feed</span>
                </div>
                <h2 className="text-xl md:text-2xl font-display font-black text-white mb-1">Recent Fault Reporters</h2>
                <p className="text-xs text-white/60 mb-5">
                  Citizens who posted road defects most recently — their reports orbit live.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {recentReporters.slice(0, 4).map(({ complaint: c, civilian: civ }, i) => (
                    <motion.button
                      key={c.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.07, type: "spring" }}
                      onClick={() => window.scrollTo({ top: 480, behavior: "smooth" })}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex items-center space-x-3 p-3 rounded-2xl text-left relative overflow-hidden group"
                      style={{
                        background: "transparent",
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                      }}
                    >
                      <img src={orbitAvatarUrls[i]} alt={civ?.full_name ?? "Reporter"}
                        className="w-9 h-9 rounded-full border-2 border-white/20 object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-white block truncate">{civ?.full_name ?? "Anonymous"}</span>
                        <span className="text-[9px] text-white/40 font-mono block truncate">{c.title} &bull; {c.district}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase ${
                          c.status === "pending" ? "bg-red-500/20 text-red-300"
                          : c.status === "resolved" ? "bg-green-500/20 text-green-300"
                          : "bg-orange-500/20 text-orange-300"
                        }`}>{c.status}</span>
                        <span className="text-[8px] text-white/30 font-mono block mt-0.5">
                          {new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>

            {/* Seamless Gradual Blur Fade at the bottom */}
            <GradualBlur 
              target="parent"
              position="bottom"
              height="3rem"
              strength={3}
              divCount={5}
              curve="bezier"
              opacity={1}
            />
          </motion.div>
        )}

        {/* ── Table + Detail grid ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Table/List section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0">
            <div>
              <h2 className="text-xl md:text-2xl font-display font-black dark:text-white text-secondary">
                PWD Complaint Management
              </h2>
              <p className="text-xs text-slate-400">Review, verify, and delegate road damage entries</p>
            </div>
            {selectedIds.length > 0 && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleBulkAssign}
                  className="py-1.5 px-3 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-md transition"
                >
                  Bulk Assign
                </button>
                <button
                  onClick={handleBulkClose}
                  className="py-1.5 px-3 rounded-lg bg-success hover:bg-success-hover text-white text-xs font-semibold shadow-md transition"
                >
                  Bulk Resolve
                </button>
              </div>
            )}
          </div>

          {/* Search bar & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by ID, Address, or title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none text-xs focus:border-primary transition"
              />
            </div>
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="py-2.5 px-4 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none"
            >
              <option value="all">All Districts</option>
              <option value="Coimbatore">Coimbatore</option>
              <option value="Chennai">Chennai</option>
            </select>
          </div>

          {/* Status Tabs */}
          <div className="flex overflow-x-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {["all", "pending", "verified", "assigned", "in_progress", "resolved"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-4 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-all ${
                  activeTab === tab
                    ? "bg-primary text-white shadow-md shadow-primary/10"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {tab === "all" ? "All Entries" : tab.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Complaints Table Container */}
          <div className="p-4 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg overflow-x-auto">
            <table className="w-full min-w-[640px] text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-mono text-slate-400 tracking-wider">
                  <th className="pb-3 pr-2">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selectedIds.length === filtered.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-primary focus:ring-primary focus:outline-none"
                    />
                  </th>
                  <th className="pb-3 pl-2">Case details</th>
                  <th className="pb-3">AI Label</th>
                  <th className="pb-3">Severity</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-slate-400">
                      No complaints found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((comp) => {
                    const isSelected = selectedIds.includes(comp.id);
                    const severityColors: any = {
                      low: "bg-slate-400",
                      medium: "bg-blue-400",
                      high: "bg-warning",
                      critical: "bg-danger"
                    };

                    const statusColors: any = {
                      pending: "text-slate-400 bg-slate-100 dark:bg-slate-900",
                      verified: "text-blue-500 bg-blue-500/10",
                      assigned: "text-purple-500 bg-purple-500/10",
                      in_progress: "text-warning bg-warning/10",
                      resolved: "text-success bg-success/10",
                      rejected: "text-danger bg-danger/10"
                    };

                    return (
                      <tr
                        key={comp.id}
                        onClick={() => selectComplaint(comp.id)}
                        className={`text-xs cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-900/40 transition ${
                          selectedComp?.id === comp.id ? "bg-primary/5 dark:bg-primary/10" : ""
                        }`}
                      >
                        <td className="py-3.5 pr-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(comp.id)}
                            className="rounded border-slate-300 text-primary focus:ring-primary focus:outline-none"
                          />
                        </td>
                        <td className="py-3.5 pl-2 max-w-[220px] pr-2">
                          <div className="flex items-center space-x-3">
                            <ComplaintThumb photoUrl={comp.photo_url} lat={comp.lat} lng={comp.lng} />
                            <div className="truncate">
                              <span className="font-bold block truncate dark:text-slate-200 text-slate-700">
                                {comp.title}
                              </span>
                              <span className="text-[10px] text-slate-400 flex items-center mt-0.5 truncate">
                                <MapPin className="w-3 h-3 mr-0.5 text-primary" />
                                {comp.address}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5">
                          <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800">
                            {comp.ai_classification?.type ?? "Unclassified"} ({Math.round((comp.ai_classification?.confidence ?? 0) * 100)}%)
                          </span>
                        </td>
                        <td className="py-3.5">
                          <span className="flex items-center space-x-1.5 font-semibold">
                            <span className={`w-2 h-2 rounded-full ${severityColors[comp.severity]}`} />
                            <span className="capitalize">{comp.severity}</span>
                          </span>
                        </td>
                        <td className="py-3.5">
                          <span className={`px-2.5 py-0.5 rounded-full font-bold text-[9px] uppercase whitespace-nowrap ${statusColors[comp.status]}`}>
                            {comp.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Details Slider / Case File Drawer */}
        <div className="lg:col-span-1 h-full min-h-[500px]">
          <AnimatePresence mode="wait">
            {selectedComp ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={selectedComp.id}
                className="rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-xl p-5 space-y-6 flex flex-col justify-between"
              >
                <div>
                  {/* Title & Close */}
                  <div className="flex justify-between items-start pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-[9.5px] uppercase font-mono tracking-wider text-slate-400">Case Incident File</span>
                      <h3 className="font-display font-extrabold text-base dark:text-white text-secondary truncate max-w-[200px] mt-0.5">
                        {selectedComp.title}
                      </h3>
                      <span className="text-[9px] font-mono text-slate-400 font-bold uppercase mt-0.5 block">{selectedComp.id}</span>
                    </div>
                    <button
                      onClick={() => selectComplaint(null)}
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Duplicate warning banner */}
                  {duplicateWarning && (
                    <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl flex items-start space-x-2 text-xs text-danger mt-4 font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-danger animate-pulse" />
                      <div>
                        <span>Duplicate Warning Alert!</span>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">
                          Similar defect ({duplicateWarning.type}) reported 45m away by another user. Review to prevent duplicate point reward gaming.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Media viewer */}
                  <div className="mt-4 relative group cursor-pointer overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800" onClick={() => setShowLightbox(true)}>
                    <img
                      src={selectedComp.photo_url}
                      alt="Defect proof"
                      className="w-full h-32 object-cover transition duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-150">
                      <Camera className="w-5 h-5 text-white mr-1.5" />
                      <span className="text-white text-xs font-bold font-mono">View Full Photo</span>
                    </div>
                  </div>

                  {/* AI Damage classification details */}
                  <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center space-x-1.5 text-[10px] font-mono uppercase text-primary font-bold">
                      <HardHat className="w-3.5 h-3.5" />
                      <span>AI Triage Diagnosis</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[9.5px] text-slate-400 block">Class Type:</span>
                        <strong className="capitalize text-slate-700 dark:text-slate-200 font-bold">{selectedComp.ai_classification?.type ?? "Unclassified"}</strong>
                      </div>
                      <div>
                        <span className="text-[9.5px] text-slate-400 block">Confidence:</span>
                        <strong className="font-mono text-slate-700 dark:text-slate-200">{Math.round((selectedComp.ai_classification?.confidence ?? 0) * 100)}%</strong>
                      </div>
                      <div>
                        <span className="text-[9.5px] text-slate-400 block">Severity Score:</span>
                        <strong className="font-mono text-slate-700 dark:text-slate-200">{selectedComp.ai_classification?.severity_score ?? "—"}/10</strong>
                      </div>
                      <div>
                        <span className="text-[9.5px] text-slate-400 block">Depth Estimation:</span>
                        <strong className="font-mono text-slate-700 dark:text-slate-200">{selectedComp.ai_classification?.depth_est || "3cm"}</strong>
                      </div>
                    </div>
                  </div>

                  {/* GPS Map Mini Pick */}
                  <div className="h-28 mt-4 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                    <DynamicMap
                      center={[selectedComp.lat, selectedComp.lng]}
                      zoom={14}
                      singlePinMode={true}
                      pins={[selectedComp]}
                    />
                  </div>

                  {/* Civilian Mini Card */}
                  {reporter && (
                    <div className="mt-4 p-3 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                          {reporter.full_name.charAt(0)}
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-700 dark:text-slate-200 block truncate max-w-[100px] leading-tight">
                            {reporter.full_name}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono block uppercase">
                            Level: {reporter.level}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-xs font-bold text-primary block">
                          {reporter.points_total} PTS
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono block">
                          District: {reporter.district}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Budget estimated */}
                  <div className="mt-4 flex justify-between items-center text-xs p-3 bg-secondary-light dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                    <span className="text-slate-400">Projected Repair Cost:</span>
                    <strong className="font-mono text-slate-700 dark:text-slate-200 text-sm">₹{(selectedComp.budget_estimated || 0).toLocaleString()}</strong>
                  </div>

                  {/* Road / Contractor info panel */}
                  {road && (
                    <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                      <div className="flex items-center space-x-1.5 text-[10px] font-mono uppercase text-secondary dark:text-slate-300 font-bold">
                        <HardHat className="w-3.5 h-3.5" />
                        <span>Road & Contractor</span>
                      </div>
                      <div>
                        <span className="text-[9.5px] text-slate-400 block">Road:</span>
                        <strong className="text-slate-700 dark:text-slate-200 block truncate">
                          {road.name}{road.type ? ` (${road.type})` : ""}
                        </strong>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[9.5px] text-slate-400 block">Contractor:</span>
                          <strong className="text-slate-700 dark:text-slate-200 truncate block">{road.contractor_name || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-[9.5px] text-slate-400 block">Contact:</span>
                          <strong className="font-mono text-slate-700 dark:text-slate-200 truncate block">{road.contractor_contact || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-[9.5px] text-slate-400 block">Sanctioned:</span>
                          <strong className="font-mono text-slate-700 dark:text-slate-200">₹{(road.budget_sanctioned || 0).toLocaleString()}</strong>
                        </div>
                        <div>
                          <span className="text-[9.5px] text-slate-400 block">Spent:</span>
                          <strong className="font-mono text-slate-700 dark:text-slate-200">₹{(road.budget_spent || 0).toLocaleString()}</strong>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[9.5px] text-slate-400 block">Last Relayed:</span>
                          <strong className="font-mono text-slate-700 dark:text-slate-200">
                            {road.last_relayed_date ? new Date(road.last_relayed_date).toLocaleDateString("en-IN") : "—"}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Action Triggers */}
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  
                  {selectedComp.status === "pending" && (
                    <div className="space-y-2.5">
                      {/* Override points editor */}
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 flex items-center">
                          <Award className="w-3.5 h-3.5 text-primary mr-1" />
                          Reward Points:
                        </span>
                        <input
                          type="number"
                          value={overridePoints}
                          onChange={(e) => setOverridePoints(Number(e.target.value))}
                          className="w-20 text-center py-1 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-primary focus:outline-none"
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={handleReject}
                          className="flex-1 py-2 rounded-xl border border-danger/20 hover:bg-danger/5 text-danger text-xs font-bold transition flex items-center justify-center"
                        >
                          <X className="w-4 h-4 mr-1" /> Reject
                        </button>
                        <button
                          onClick={handleVerify}
                          className="flex-[2] py-2 rounded-xl bg-gradient-to-r from-primary to-orange-500 hover:from-primary-hover hover:to-orange-600 text-white text-xs font-bold shadow-lg shadow-primary/10 transition flex items-center justify-center"
                        >
                          <Check className="w-4 h-4 mr-1" /> Verify & Award
                        </button>
                      </div>

                      {/* Direct worker assignment for pending cases */}
                      <div className="pt-2 mt-1 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                          Or assign a worker directly
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={assignWorkerId}
                            onChange={(e) => setAssignWorkerId(e.target.value)}
                            className="flex-1 py-2 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none"
                          >
                            <option value="">Choose Worker…</option>
                            {workers.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name} ({w.skill_tags[0]} • {w.rating}⭐)
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={handleAssignWorker}
                            disabled={!assignWorkerId}
                            className="py-2 px-3 rounded-xl bg-secondary hover:bg-secondary-hover text-white text-xs font-bold transition disabled:opacity-40 flex items-center justify-center shrink-0"
                          >
                            <HardHat className="w-4 h-4 mr-1" /> Assign
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedComp.status === "verified" && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                          Select Contractor / Worker
                        </label>
                        <select
                          value={assignWorkerId}
                          onChange={(e) => setAssignWorkerId(e.target.value)}
                          className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none"
                        >
                          <option value="">Choose Worker...</option>
                          {workers
                            .filter(w => w.district === selectedComp.district && w.availability === "available")
                            .map(w => (
                              <option key={w.id} value={w.id}>
                                {w.name} ({w.skill_tags[0]} • Rating {w.rating}⭐)
                              </option>
                            ))}
                        </select>
                      </div>

                      <button
                        onClick={handleAssignWorker}
                        disabled={!assignWorkerId}
                        className="w-full py-2.5 rounded-xl bg-secondary hover:bg-secondary-hover text-white text-xs font-bold transition flex items-center justify-center disabled:opacity-40"
                      >
                        <HardHat className="w-4 h-4 mr-1.5" /> Dispatch Worker
                      </button>
                    </div>
                  )}

                  {(selectedComp.status === "assigned" || selectedComp.status === "in_progress") && (
                    <button
                      onClick={handleCloseCase}
                      className="w-full py-3 rounded-xl bg-success hover:bg-success-hover text-white text-xs font-bold shadow-lg shadow-success/15 transition flex items-center justify-center"
                    >
                      <Check className="w-5 h-5 mr-1.5" /> Mark Case Resolved (Complete)
                    </button>
                  )}

                  {selectedComp.status === "resolved" && (
                    <div className="p-3 bg-success/10 border border-success/20 rounded-xl text-center text-xs text-success font-semibold flex items-center justify-center space-x-1.5">
                      <Check className="w-5 h-5" />
                      <span>Repair Completed! Case Resolved</span>
                    </div>
                  )}

                  {selectedComp.status === "rejected" && (
                    <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-center text-xs text-danger font-semibold flex items-center justify-center space-x-1.5">
                      <X className="w-5 h-5" />
                      <span>Complaint Rejected</span>
                    </div>
                  )}

                </div>
              </motion.div>
            ) : (
              <div className="h-full min-h-[450px] border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <Info className="w-10 h-10 mb-2.5 text-slate-400" />
                <h4 className="font-bold text-sm">No Entry Selected</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
                  Click on any complaint row to review photo evidence, AI analysis, GPS coordinates, and issue dispatches.
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>

        </div>{/* end inner grid */}

      </main>

      {/* Full Photo Lightbox Overlay */}
      <AnimatePresence>
        {showLightbox && selectedComp && (
          <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
            <button 
              onClick={() => setShowLightbox(false)}
              className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={selectedComp.photo_url}
              alt="Road defect full sized view"
              className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl border border-white/10"
            />
            <div className="mt-4 text-center text-white space-y-1">
              <h3 className="font-bold text-sm">{selectedComp.title}</h3>
              <p className="text-xs text-slate-400">{selectedComp.address}</p>
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
