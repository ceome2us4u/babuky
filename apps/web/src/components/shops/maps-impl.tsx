"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, Circle, useMap, useMapEvents } from "react-leaflet";
import { useEffect } from "react";

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIB = "&copy; OpenStreetMap contributors";

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:linear-gradient(140deg,#FFD700,#D4AF37);box-shadow:0 0 12px rgba(212,175,55,.8);border:2px solid #4A0E17"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

const buyerIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 0 0 6px rgba(212,175,55,.25);border:2px solid #D4AF37"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Re-centre the map when the centre prop changes (e.g. after "use my location").
function Recenter({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom ?? map.getZoom());
  }, [map, center, zoom]);
  return null;
}

export function LocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  return (
    <MapContainer center={[lat, lng]} zoom={14} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
      <TileLayer url={TILES} attribution={ATTRIB} />
      <ClickCapture onPick={onChange} />
      <Recenter center={[lat, lng]} />
      <Marker
        position={[lat, lng]}
        icon={pinIcon}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const p = (e.target as L.Marker).getLatLng();
            onChange(p.lat, p.lng);
          },
        }}
      />
    </MapContainer>
  );
}

export type ShopPin = {
  id: string;
  name: string;
  industry: string;
  lat: number;
  lng: number;
  distanceKm: number;
};

export function ShopsMap({
  center,
  radiusKm,
  shops,
}: {
  center: [number, number];
  radiusKm: number;
  shops: ShopPin[];
}) {
  return (
    <MapContainer
      center={center}
      zoom={radiusKm > 5 ? 11 : 12}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer url={TILES} attribution={ATTRIB} />
      <Recenter center={center} zoom={radiusKm > 5 ? 11 : 12} />
      <Marker position={center} icon={buyerIcon}>
        <Popup>You are here</Popup>
      </Marker>
      <Circle
        center={center}
        radius={radiusKm * 1000}
        pathOptions={{ color: "#D4AF37", fillColor: "#D4AF37", fillOpacity: 0.07, weight: 1 }}
      />
      {shops.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={pinIcon}>
          <Popup>
            <strong>{s.name}</strong>
            <br />
            {s.industry} · {s.distanceKm.toFixed(1)} km away
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
