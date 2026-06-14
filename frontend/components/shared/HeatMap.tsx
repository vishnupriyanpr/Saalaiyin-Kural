"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

export interface HeatPoint {
  id: string;
  lat: number;
  lng: number;
  status: string;
  severity: string;
  road_type?: string;
  created_at?: string;
}

const SEVERITY_INTENSITY: Record<string, number> = {
  low: 0.4,
  medium: 0.6,
  high: 0.85,
  critical: 1.0,
};

function statusColor(status: string): string {
  switch (status) {
    case "pending": return "#DC2626";
    case "verified": return "#3B82F6";
    case "assigned": return "#8B5CF6";
    case "in_progress": return "#D97706";
    case "resolved": return "#16A34A";
    default: return "#94A3B8";
  }
}

// Green -> amber -> red gradient for the heat layer.
const HEAT_GRADIENT = { 0.2: "#16A34A", 0.5: "#D97706", 0.8: "#FF6B2C", 1.0: "#DC2626" };

/** Renders (and keeps updated) the leaflet.heat layer. Created after the map
 *  mounts via useMap — required because leaflet.heat is a client-only plugin. */
function HeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    const data: [number, number, number][] = points.map((p) => [
      p.lat,
      p.lng,
      SEVERITY_INTENSITY[p.severity] ?? 0.5,
    ]);

    if (!layerRef.current) {
      // @ts-ignore - L.heatLayer comes from the leaflet.heat plugin
      layerRef.current = L.heatLayer(data, {
        radius: 28,
        blur: 20,
        maxZoom: 17,
        max: 1.0,
        gradient: HEAT_GRADIENT,
      });
      layerRef.current.addTo(map);
    } else {
      layerRef.current.setLatLngs(data);
    }

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points]);

  return null;
}

/** Recenters the map when the center prop changes. */
function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

interface HeatMapProps {
  center: [number, number];
  zoom: number;
  points: HeatPoint[];
  userLocation?: [number, number] | null;
  onPointClick?: (id: string) => void;
}

export default function HeatMap({
  center,
  zoom,
  points,
  userLocation,
  onPointClick,
}: HeatMapProps) {
  return (
    <div className="w-full h-full relative overflow-hidden" style={{ minHeight: "400px" }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: "100%", height: "100%", minHeight: "400px", zIndex: 1 }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Recenter center={center} zoom={zoom} />
        <HeatLayer points={points} />

        {/* Blue pulsing user marker */}
        {userLocation && (
          <>
            <Circle
              center={userLocation}
              radius={60}
              pathOptions={{ color: "#2563EB", fillColor: "#3B82F6", fillOpacity: 0.25, weight: 1 }}
            />
            <Marker
              position={userLocation}
              icon={L.divIcon({
                className: "user-loc-icon",
                html: `<div style="position:relative;width:18px;height:18px;">
                    <span style="position:absolute;inset:0;border-radius:9999px;background:#3B82F6;opacity:0.4;animation:rw-pulse 1.8s ease-out infinite;"></span>
                    <span style="position:absolute;top:4px;left:4px;width:10px;height:10px;border-radius:9999px;background:#2563EB;border:2px solid #fff;box-shadow:0 0 6px rgba(37,99,235,0.8);"></span>
                  </div>
                  <style>@keyframes rw-pulse{0%{transform:scale(1);opacity:0.5}100%{transform:scale(2.6);opacity:0}}</style>`,
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              })}
            >
              <Popup>You are here</Popup>
            </Marker>
          </>
        )}

        {/* Individual clickable complaint pins ON TOP of the heat layer */}
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            zIndexOffset={1000}
            icon={L.divIcon({
              className: "complaint-pin-icon",
              html: `<div style="width:14px;height:14px;border-radius:9999px;background:${statusColor(
                p.status
              )};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            })}
            eventHandlers={{ click: () => onPointClick?.(p.id) }}
          >
            <Popup>
              <div className="p-1 max-w-[180px]">
                <span className="font-bold text-xs capitalize block">{p.road_type || "Road defect"}</span>
                <span className="text-[10px] font-mono text-slate-400 capitalize block mt-0.5">
                  {p.severity} • {p.status.replace("_", " ")}
                </span>
                {p.created_at && (
                  <span className="text-[10px] text-slate-400 block">
                    {new Date(p.created_at).toLocaleDateString("en-IN")}
                  </span>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
