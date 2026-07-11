"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// A DivIcon sidesteps Leaflet's default marker image paths entirely, which
// otherwise resolve incorrectly under Next.js's bundler.
const busIcon = new L.DivIcon({
  html: `<div style="background:#1a3c4a;color:#fff;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 1px 4px rgba(0,0,0,0.4);">🚌</div>`,
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export interface VehiclePoint {
  vehicle_id: string;
  vehicle_no: string;
  lat: number;
  lng: number;
  recorded_at: string;
}

export function BusTrackerMap({ points }: { points: VehiclePoint[] }) {
  const center: [number, number] = points.length ? [points[0]!.lat, points[0]!.lng] : [23.8103, 90.4125];

  return (
    <MapContainer center={center} zoom={13} style={{ height: "60vh", width: "100%", borderRadius: 8 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p) => (
        <Marker key={p.vehicle_id} position={[p.lat, p.lng]} icon={busIcon}>
          <Popup>
            <p className="font-medium">{p.vehicle_no}</p>
            <p className="text-xs text-gray-500">Updated {new Date(p.recorded_at).toLocaleTimeString()}</p>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
