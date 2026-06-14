"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Compass, Plus, Navigation, Loader2 } from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { api } from "@/lib/api";
import { NearbyComplaint } from "@/lib/types";
import DynamicHeatMap from "@/components/shared/DynamicHeatMap";
import { useRequireAuth, getStoredUser, getToken } from "@/lib/useAuth";
import { useLocation } from "@/lib/useLocation";

const RADIUS_OPTIONS = [5, 10, 25];
const FALLBACK_CENTER: [number, number] = [11.0168, 76.9558]; // Coimbatore

export default function CivilianMap() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession] = useState<any>(null);

  const { coords, loading: locLoading, error: locError, refetch } = useLocation();

  const [complaints, setComplaints] = useState<NearbyComplaint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [radius, setRadius] = useState(10);

  useEffect(() => {
    if (ready) setSession(getStoredUser());
  }, [ready]);

  const center: [number, number] = coords ? [coords.lat, coords.lng] : FALLBACK_CENTER;

  const fetchNearby = useCallback(async () => {
    if (!coords) return;
    setLoading(true);
    setError(false);
    try {
      const data = await api.get<NearbyComplaint[] | { complaints: NearbyComplaint[] }>(
        `/api/complaints/nearby?lat=${coords.lat}&lng=${coords.lng}&radius=${radius}`,
        getToken() || undefined
      );
      // Backend wraps list responses as { complaints: [...] }; accept either shape.
      const list = Array.isArray(data) ? data : ((data as any)?.complaints ?? []);
      setComplaints(list);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [coords, radius]);

  useEffect(() => {
    if (ready && coords) fetchNearby();
  }, [ready, coords, radius, fetchNearby]);

  const handleReportHere = () => {
    router.push(`/civilian/report?lat=${center[0]}&lng=${center[1]}`);
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <Compass className="w-8 h-8 text-primary animate-spin" />
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Loading map…</p>
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Navbar portal="civilian" userName={session?.name} />

      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {locLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50 z-[500]">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
            <p className="text-xs font-mono text-slate-400">Locating you…</p>
          </div>
        ) : (
          <DynamicHeatMap
            center={center}
            zoom={radius <= 5 ? 14 : radius <= 10 ? 13 : 12}
            points={complaints}
            userLocation={coords ? [coords.lat, coords.lng] : null}
            onPointClick={(id) => router.push(`/civilian/track?id=${id}`)}
          />
        )}

        {/* Location permission error banner */}
        {locError && (
          <div className="absolute top-20 lg:top-4 left-1/2 -translate-x-1/2 z-[1000] max-w-sm w-[90%] p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold shadow-lg flex items-center justify-between gap-2">
            <span className="flex items-center"><AlertCircle className="w-4 h-4 mr-1.5 shrink-0" />{locError}</span>
            <button onClick={refetch} className="underline shrink-0">Retry</button>
          </div>
        )}

        {/* Radius slider / selector */}
        <div className="absolute top-4 left-4 z-[1000] p-3.5 glass rounded-2xl border border-slate-200 shadow-xl text-xs">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block mb-2">
            Search Radius
          </span>
          <div className="flex items-center gap-1.5">
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRadius(r)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                  radius === r ? "bg-primary text-white shadow" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {r} km
              </button>
            ))}
          </div>
          <div className="mt-2.5 space-y-1.5">
            <span className="text-[9px] font-mono uppercase text-slate-400 block">Density legend</span>
            <div className="h-2 w-full rounded-full" style={{ background: "linear-gradient(90deg,#16A34A,#D97706,#DC2626)" }} />
            <div className="flex justify-between text-[8px] text-slate-400 font-mono">
              <span>Low</span><span>High</span>
            </div>
          </div>
        </div>

        {/* Recenter button */}
        <button
          onClick={refetch}
          className="absolute top-4 right-4 z-[1000] p-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 shadow-xl transition"
          title="Recenter to my GPS location"
        >
          <Navigation className="w-5 h-5" />
        </button>

        {loading && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow text-[11px] font-mono text-slate-500 flex items-center">
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-primary" /> Loading nearby reports…
          </div>
        )}
        {error && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full bg-red-50 border border-red-200 shadow text-[11px] font-semibold text-red-600 flex items-center">
            Failed to load nearby reports.
            <button onClick={fetchNearby} className="underline ml-1.5">Retry</button>
          </div>
        )}

        {/* Floating Report Button */}
        <div className="absolute bottom-6 right-6 z-[1000] flex flex-col items-end space-y-2.5">
          <button
            onClick={handleReportHere}
            className="py-3 px-5 rounded-2xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-xl shadow-primary/20 transition-all flex items-center space-x-1.5 font-display"
          >
            <Plus className="w-4 h-4" />
            <span>Report Defect Here</span>
          </button>
        </div>
      </div>
    </div>
  );
}
