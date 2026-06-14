"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MapPin, AlertCircle, Info, RefreshCw, Layers, SlidersHorizontal, Plus, ShieldCheck } from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { db } from "@/lib/db";
import { Complaint, Project } from "@/lib/types";
import { useRequireAuth, getStoredUser } from "@/lib/useAuth";
import DynamicMap from "@/components/shared/DynamicMap";
import DynamicHeatMap from "@/components/shared/DynamicHeatMap";

export default function AdminMap() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession] = useState<any>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Map settings
  const [mapCenter, setMapCenter] = useState<[number, number]>([11.0175, 76.9555]); // Coimbatore center
  const [mapZoom, setMapZoom] = useState(14);
  const [heatmap, setHeatmap] = useState(false);
  const [polygonZone, setPolygonZone] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // Sidebar complaint listing
  const [activeList, setActiveList] = useState<Complaint[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);

  // Bulk project creation overlay state
  const [bulkBundle, setBulkBundle] = useState<{
    show: boolean;
    ids: string[];
    saving: number;
    originalCost: number;
    reducedCost: number;
  } | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const comps = await db.getComplaints();
      setComplaints(comps);
      setActiveList(comps);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load session & data
  useEffect(() => {
    if (!ready) return;
    setSession(getStoredUser());
    loadData();
  }, [ready, loadData]);

  // Apply filters to pins
  const filteredPins = complaints.filter(comp => {
    const matchesStatus = statusFilter === "all" || comp.status === statusFilter;
    const matchesType = typeFilter === "all" || comp.type === typeFilter;
    return matchesStatus && matchesType;
  });

  const handlePinClick = (pinId: string) => {
    setSelectedCompId(pinId);
    const comp = complaints.find(c => c.id === pinId);
    if (comp) {
      // Zoom map into pin
      setMapCenter([comp.lat, comp.lng]);
      setMapZoom(16);
    }
  };

  const handlePolygonComplete = (selectedIds: string[], clusterCenter: [number, number]) => {
    if (selectedIds.length === 0) {
      alert("No pending complaints detected inside the optimized bulk zone polygon.");
      return;
    }

    const selectedComps = complaints.filter(c => selectedIds.includes(c.id));
    const originalCost = selectedComps.reduce((sum, c) => sum + (c.budget_estimated || 0), 0);
    const reducedCost = Math.round(originalCost * 0.75); // 25% savings
    const saving = originalCost - reducedCost;

    setBulkBundle({
      show: true,
      ids: selectedIds,
      saving,
      originalCost,
      reducedCost
    });

    setMapCenter(clusterCenter);
    setMapZoom(15);
  };

  const handleDeployBulkProject = async () => {
    if (!bulkBundle) return;
    
    try {
      const projId = `proj-${Math.random().toString(36).substr(2, 9)}`;
      
      // Create bulk project
      await db.createProject({
        id: projId,
        complaint_ids: bulkBundle.ids,
        title: "RS Puram Cluster Bulk Repair",
        district: "Coimbatore",
        budget_total: bulkBundle.reducedCost,
        budget_spent: 0,
        status: "planning",
        worker_ids: ["wrk-111"],
      });

      // Update complaints status
      for (const id of bulkBundle.ids) {
        await db.updateComplaint(id, {
          status: "assigned",
          worker_id: "wrk-111"
        });
      }

      // Add Notification
      await db.createNotification({
        target_role: "admin",
        title: "Bulk Zone Verified! 🛠️",
        body: `Created project 'RS Puram Cluster Bulk Repair' for ${bulkBundle.ids.length} cases. Budget saved: ₹${bulkBundle.saving.toLocaleString()}`,
        type: "work_assign"
      });

      // Notify reporters
      const bundledComps = complaints.filter(c => bulkBundle.ids.includes(c.id));
      for (const comp of bundledComps) {
        await db.createNotification({
          target_role: "civilian",
          target_id: comp.civilian_id,
          title: "Optimized Bulk Project Dispatched",
          body: `Good news! Your report of '${comp.title}' has been verified and optimized in a bulk dispatch zone. Savings applied.`,
          type: "complaint_update"
        });
      }

      setBulkBundle(null);
      await loadData();
      alert(`Bulk Project Dispatched successfully! Saved ₹${bulkBundle.saving.toLocaleString()} in State Funds.`);
    } catch (err) {
      console.error(err);
    }
  };

  // Convert complaints format for LeafletMap component
  const mapPins = filteredPins.map(c => ({
    id: c.id,
    lat: c.lat,
    lng: c.lng,
    title: c.title,
    type: c.type,
    severity: c.severity,
    status: c.status,
    address: c.address
  }));

  // Heatmap points (all filtered complaints, regardless of admin location).
  const heatPoints = filteredPins.map(c => ({
    id: c.id,
    lat: c.lat,
    lng: c.lng,
    status: c.status,
    severity: c.severity,
    road_type: c.type,
    created_at: c.created_at,
  }));

  const selectedComp = complaints.find(c => c.id === selectedCompId);

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4">
        <div className="w-56 h-8 rounded bg-slate-200 animate-pulse" />
        <div className="w-full max-w-4xl h-72 rounded-2xl bg-slate-200 animate-pulse mx-4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-500" />
        <p className="text-sm font-semibold text-slate-700">Failed to load the map data.</p>
        <button onClick={loadData} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md">Retry</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark text-slate-800 dark:text-slate-100 flex flex-col transition-colors">
      <Navbar portal="admin" userName={session?.name} />

      <div className="flex-1 flex flex-col lg:flex-row relative">
        
        {/* Map Canvas */}
        <div className="flex-1 h-[55dvh] lg:h-[calc(100vh-65px)] relative">
          {heatmap ? (
            <DynamicHeatMap
              center={mapCenter}
              zoom={9}
              points={heatPoints}
              onPointClick={handlePinClick}
            />
          ) : (
            <DynamicMap
              center={mapCenter}
              zoom={mapZoom}
              pins={mapPins}
              onPinClick={handlePinClick}
              drawPolygonZone={polygonZone}
              onPolygonComplete={handlePolygonComplete}
            />
          )}

          {/* Map floating toggles */}
          <div className="absolute bottom-5 left-5 z-[1000] p-4 glass rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col space-y-3 max-w-[200px]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block mb-1">
              Map Overlays
            </span>
            <label className="flex items-center space-x-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={heatmap}
                onChange={(e) => setHeatmap(e.target.checked)}
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span className="font-semibold text-slate-600 dark:text-slate-300">Density Heatmap</span>
            </label>
            <label className="flex items-center space-x-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={polygonZone}
                onChange={(e) => setPolygonZone(e.target.checked)}
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span className="font-semibold text-slate-600 dark:text-slate-300">Bulk Repair Zones</span>
            </label>
          </div>
        </div>

        {/* Sidebar panels */}
        <div className="w-full lg:w-96 glass border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between max-h-[calc(100vh-130px)] lg:max-h-[calc(100vh-65px)] overflow-y-auto">
          
          {/* Filters & Listing */}
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-display font-black tracking-tight dark:text-white text-secondary">
                Spatial GIS Engine
              </h2>
              <p className="text-[11px] text-slate-400">Interact with GPS records and boundary polygons</p>
            </div>

            {/* Filter controls */}
            <div className="space-y-2.5">
              <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-mono">
                <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                <span>Filters</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="py-1.5 px-2.5 rounded-lg text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="py-1.5 px-2.5 rounded-lg text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none"
                >
                  <option value="all">All Types</option>
                  <option value="pothole">Potholes</option>
                  <option value="crack">Cracks</option>
                  <option value="waterlogging">Water clog</option>
                  <option value="signage">Signages</option>
                </select>
              </div>
            </div>

            {/* Active List */}
            <div className="space-y-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                Visible cases ({filteredPins.length})
              </span>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {filteredPins.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No active markers matching filters.</p>
                ) : (
                  filteredPins.map((comp) => {
                    const isSelected = comp.id === selectedCompId;
                    const statusColors: any = {
                      pending: "bg-danger",
                      verified: "bg-blue-500",
                      assigned: "bg-purple-500",
                      in_progress: "bg-warning",
                      resolved: "bg-success"
                    };

                    return (
                      <div
                        key={comp.id}
                        onClick={() => handlePinClick(comp.id)}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                          isSelected
                            ? "bg-primary/5 border-primary/45 shadow-sm"
                            : "bg-slate-50/50 hover:bg-slate-100/50 dark:bg-slate-900/40 dark:hover:bg-slate-900/80 border-slate-200 dark:border-slate-800"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-0.5">
                          <span className="font-bold truncate max-w-[150px] dark:text-slate-200 text-slate-700">
                            {comp.title}
                          </span>
                          <span className={`w-2 h-2 rounded-full ${statusColors[comp.status]}`} />
                        </div>
                        <span className="text-[9.5px] font-mono text-slate-400 block truncate">
                          {comp.address}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Selection detail / bulk preview drawer */}
          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
            {bulkBundle && bulkBundle.show ? (
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 space-y-3 shadow-md glow-xp">
                <div className="flex items-center space-x-1 text-primary font-bold text-xs uppercase tracking-wider font-mono">
                  <ShieldCheck className="w-4 h-4 animate-bounce" />
                  <span>Bulk Optimization Bundle</span>
                </div>
                <div className="text-xs space-y-1 text-slate-300">
                  <p>Defects Grouped: <strong className="font-bold text-white">{bulkBundle.ids.length} Pending Potholes</strong></p>
                  <p>Individual Cost sum: <strong className="font-mono">₹{bulkBundle.originalCost.toLocaleString()}</strong></p>
                  <p>Optimized Cost (25% saving): <strong className="font-mono text-success">₹{bulkBundle.reducedCost.toLocaleString()}</strong></p>
                </div>
                <div className="p-2 rounded bg-success/15 border border-success/30 text-success text-[10.5px] font-semibold text-center">
                  Projected Savings: ₹{bulkBundle.saving.toLocaleString()}!
                </div>
                <div className="flex gap-2 pt-1.5">
                  <button
                    onClick={() => setBulkBundle(null)}
                    className="flex-1 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-900 text-[11px] font-bold text-slate-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeployBulkProject}
                    className="flex-[2] py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-[11px] font-bold shadow-md transition"
                  >
                    Deploy Project
                  </button>
                </div>
              </div>
            ) : selectedComp ? (
              <div className="space-y-3.5 text-xs">
                <div className="pb-2 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <span className="font-bold dark:text-white text-secondary">Pin case info</span>
                  <button 
                    onClick={() => setSelectedCompId(null)}
                    className="text-[10px] text-slate-400 hover:text-slate-200"
                  >
                    Close
                  </button>
                </div>
                <div>
                  <span className="text-[9.5px] text-slate-400 block">Defect Title:</span>
                  <strong className="text-slate-700 dark:text-slate-200 block truncate">{selectedComp.title}</strong>
                </div>
                <div>
                  <span className="text-[9.5px] text-slate-400 block">Type:</span>
                  <strong className="capitalize text-slate-700 dark:text-slate-200">{selectedComp.type} (Severity {selectedComp.severity})</strong>
                </div>
                <div>
                  <span className="text-[9.5px] text-slate-400 block">Coordinates:</span>
                  <strong className="font-mono text-slate-700 dark:text-slate-200">
                    {selectedComp.lat.toFixed(4)}°N, {selectedComp.lng.toFixed(4)}°E
                  </strong>
                </div>
                <button
                  onClick={() => router.push(`/admin/complaints?id=${selectedComp.id}`)}
                  className="w-full py-2 bg-secondary hover:bg-secondary-hover text-white text-xs font-bold rounded-lg shadow-sm transition"
                >
                  Manage case files &rarr;
                </button>
              </div>
            ) : (
              <div className="p-4 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl flex items-center justify-center text-center text-[11px] text-slate-400">
                <Info className="w-4 h-4 mr-1 text-slate-400" />
                <span>Select a pin or draw a Bulk Repair Zone polygon to optimize dispatches.</span>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
