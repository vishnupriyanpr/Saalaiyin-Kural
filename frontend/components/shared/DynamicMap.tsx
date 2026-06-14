"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Loader2 } from "lucide-react";

// Dynamically import LeafletMap with SSR disabled
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-100 dark:bg-slate-900/60 rounded-xl flex flex-col items-center justify-center border border-slate-200 dark:border-slate-800 animate-pulse">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
      <span className="text-xs text-slate-400 font-mono mt-2">Loading Map Engine...</span>
    </div>
  ),
});

interface DynamicMapProps {
  center: [number, number];
  zoom: number;
  pins?: any[];
  singlePinMode?: boolean;
  interactive?: boolean;
  onLocationSelect?: (lat: number, lng: number, address: string) => void;
  selectedPinId?: string;
  onPinClick?: (pinId: string) => void;
  drawPolygonZone?: boolean;
  onPolygonComplete?: (selectedPinIds: string[], center: [number, number]) => void;
  heatmapMode?: boolean;
}

export default function DynamicMap(props: DynamicMapProps) {
  return <LeafletMap {...props} />;
}
