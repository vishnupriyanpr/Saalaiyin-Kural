"use client";

import React, { useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Helper to get color by status
const getStatusColor = (status: string) => {
  switch (status) {
    case "pending": return "#DC2626"; // red
    case "verified": return "#3B82F6"; // blue
    case "assigned": return "#8B5CF6"; // purple
    case "in_progress": return "#D97706"; // amber
    case "resolved": return "#16A34A"; // green
    default: return "#94A3B8";
  }
};

// Custom DIV icons to bypass Next.js Leaflet asset-loading bugs
const createCustomPin = (status: string, severity: string) => {
  const color = getStatusColor(status);
  const isUrgent = severity === "high" || severity === "critical";
  const animateClass = isUrgent && status === "pending" ? "pulse-ring-danger" : "";

  return L.divIcon({
    html: `
      <div class="relative flex items-center justify-center w-8 h-8 ${animateClass}">
        <div class="w-4 h-4 rounded-full shadow-lg border border-white" style="background-color: ${color}"></div>
      </div>
    `,
    className: "custom-div-icon",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  type: string;
  severity: string;
  status: string;
  address?: string;
  date?: string;
}

interface LeafletMapProps {
  center: [number, number];
  zoom: number;
  pins?: MapPin[];
  singlePinMode?: boolean; // Show only one pin
  interactive?: boolean; // Allow clicking to place pin (civilian report)
  onLocationSelect?: (lat: number, lng: number, address: string) => void;
  selectedPinId?: string;
  onPinClick?: (pinId: string) => void;
  drawPolygonZone?: boolean; // Draw a selection box for bulk repair
  onPolygonComplete?: (selectedPinIds: string[], center: [number, number]) => void;
  heatmapMode?: boolean;
}

// Click event receiver for manual pin placement (Client mode)
function MapClickHandler({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LeafletMap({
  center,
  zoom,
  pins = [],
  singlePinMode = false,
  interactive = false,
  onLocationSelect,
  selectedPinId,
  onPinClick,
  drawPolygonZone = false,
  onPolygonComplete,
  heatmapMode = false,
}: LeafletMapProps) {
  const [selectedLocation, setSelectedLocation] = useState<[number, number] | null>(
    singlePinMode ? center : null
  );

  // Polygon drawing state (demo boundary around Coimbatore cluster)
  const coimbatoreClusterCoords: [number, number][] = [
    [11.0200, 76.9530],
    [11.0200, 76.9600],
    [11.0140, 76.9600],
    [11.0140, 76.9530],
  ];

  const handleMapClick = async (lat: number, lng: number) => {
    if (!interactive) return;
    setSelectedLocation([lat, lng]);
    
    if (onLocationSelect) {
      // Mock reverse geocoding
      let address = "Coimbatore, RS Puram";
      if (lat.toFixed(3) === "11.017" && lng.toFixed(3) === "76.956") {
        address = "RS Puram East St, Near Pazhamudir Nilayam, Coimbatore";
      } else {
        address = `Custom Location (${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E)`;
      }
      onLocationSelect(lat, lng, address);
    }
  };

  const triggerPolygonBundle = () => {
    if (onPolygonComplete) {
      // Find pins inside Coimbatore cluster coordinates
      const insidePins = pins.filter(p => p.status === "pending" && p.lat >= 11.014 && p.lat <= 11.020 && p.lng >= 76.953 && p.lng <= 76.960);
      onPolygonComplete(insidePins.map(p => p.id), [11.0175, 76.9555]);
    }
  };

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ minHeight: "400px" }}>
      
      {/* Dynamic Bulk Repair Button overlay */}
      {drawPolygonZone && pins.length > 0 && (
        <div className="absolute top-3 right-3 z-[1000] glass p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-[200px]">
          <span className="text-[10px] font-mono uppercase text-primary font-bold block mb-1.5">Zone Optimization</span>
          <button
            onClick={triggerPolygonBundle}
            className="w-full py-1.5 px-3 rounded-lg bg-primary hover:bg-primary-hover text-white text-[11px] font-bold shadow-md transition"
          >
            Create Bulk Zone Project
          </button>
        </div>
      )}

      <MapContainer
        key={`${center[0]}-${center[1]}`}
        center={center}
        zoom={zoom}
        style={{ width: "100%", height: "100%", minHeight: "400px", zIndex: 1 }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="dark:invert dark:opacity-80 dark:contrast-125" // Sleek dark tile emulation!
        />

        {/* Heatmap density indicators (rendered as red circles of varying opacity) */}
        {heatmapMode && pins.map((p) => (
          <Circle
            key={`heat-${p.id}`}
            center={[p.lat, p.lng]}
            radius={250}
            pathOptions={{
              fillColor: p.severity === "critical" ? "#DC2626" : p.severity === "high" ? "#FF6B2C" : "#D97706",
              fillOpacity: p.severity === "critical" ? 0.35 : 0.2,
              stroke: false,
            }}
          />
        ))}

        {/* Render polygon boundary for Coimbatore cluster zone */}
        {drawPolygonZone && (
          <Polygon
            positions={coimbatoreClusterCoords}
            pathOptions={{
              color: "#FF6B2C",
              weight: 2,
              fillColor: "#FF6B2C",
              fillOpacity: 0.1,
              dashArray: "5, 5",
            }}
          />
        )}

        {/* Dynamic interactive pin placement */}
        {interactive && selectedLocation && (
          <Marker position={selectedLocation} icon={createCustomPin("pending", "high")}>
            <Popup>
              <span className="text-xs font-bold block text-primary">Selected Point</span>
              <span className="text-[10px] font-mono text-slate-400">
                {selectedLocation[0].toFixed(4)}°N, {selectedLocation[1].toFixed(4)}°E
              </span>
            </Popup>
          </Marker>
        )}

        {/* Render standard complaint pins */}
        {!singlePinMode && pins.map((pin) => (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            icon={createCustomPin(pin.status, pin.severity)}
            eventHandlers={{
              click: () => {
                if (onPinClick) onPinClick(pin.id);
              },
            }}
          >
            <Popup>
              <div className="p-1 max-w-[180px]">
                <div className="flex items-center space-x-1.5 mb-1 justify-between">
                  <span className="font-bold text-xs truncate max-w-[120px]">{pin.title}</span>
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: getStatusColor(pin.status) }}
                  />
                </div>
                <span className="text-[10px] block font-mono text-slate-400 capitalize mb-1">
                  Type: {pin.type} • {pin.severity}
                </span>
                {pin.address && (
                  <p className="text-[10.5px] leading-snug text-slate-500 mb-1">{pin.address}</p>
                )}
                {onPinClick && (
                  <button
                    onClick={() => onPinClick(pin.id)}
                    className="text-[10px] text-primary hover:underline font-bold mt-1 block"
                  >
                    View Case Details &rarr;
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Single case pin display */}
        {singlePinMode && (
          <Marker position={center} icon={createCustomPin(pins[0]?.status || "pending", pins[0]?.severity || "medium")}>
            <Popup>
              <div className="p-1">
                <span className="font-bold text-xs">{pins[0]?.title || "Incident Location"}</span>
                <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5">{pins[0]?.address}</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Click event detector */}
        {interactive && <MapClickHandler onSelect={handleMapClick} />}
      </MapContainer>
    </div>
  );
}
