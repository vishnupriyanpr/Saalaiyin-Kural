"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Loader2 } from "lucide-react";
import type { HeatPoint } from "./HeatMap";

const HeatMap = dynamic(() => import("./HeatMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-100 dark:bg-slate-900/60 rounded-xl flex flex-col items-center justify-center border border-slate-200 dark:border-slate-800 animate-pulse">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
      <span className="text-xs text-slate-400 font-mono mt-2">Loading heatmap…</span>
    </div>
  ),
});

interface DynamicHeatMapProps {
  center: [number, number];
  zoom: number;
  points: HeatPoint[];
  userLocation?: [number, number] | null;
  onPointClick?: (id: string) => void;
}

export default function DynamicHeatMap(props: DynamicHeatMapProps) {
  return <HeatMap {...props} />;
}
