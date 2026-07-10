import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl:       require("leaflet/dist/images/marker-icon.png"),
  shadowUrl:     require("leaflet/dist/images/marker-shadow.png"),
});

// ── Inner component: listens for map clicks and reverse-geocodes ──
function MapClickHandler({ onCitySelect, setClickInfo }) {
  useMapEvents({
    click: async (e) => {
      const { lat, lng } = e.latlng;
      setClickInfo({ lat, lng, status: "loading" });
      try {
        const res  = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        const city =
          data.address?.city ||
          data.address?.town ||
          data.address?.village ||
          data.address?.county ||
          data.address?.state;
        if (city) {
          setClickInfo({ lat, lng, status: "found", city });
          onCitySelect(city);
        } else {
          setClickInfo({ lat, lng, status: "notfound" });
        }
      } catch {
        setClickInfo({ lat, lng, status: "error" });
      }
    },
  });
  return null;
}

// ── Inner component: smoothly pans map to new city coordinates ──
function MapCenterUpdater({ coords }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([coords.lat, coords.lng], 10, { duration: 1.5 });
  }, [coords, map]);
  return null;
}

// ── Main MapView component ──────────────────────────────────────
export default function MapView({ city, onCitySelect, aqiColor }) {
  const [coords,    setCoords]    = useState({ lat: 20.5937, lng: 78.9629 });
  const [clickInfo, setClickInfo] = useState(null);

  // Geocode the city name → lat/lng using Open-Meteo (free, no API key)
  useEffect(() => {
    if (!city) return;
    (async () => {
      try {
        const res  = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
        );
        const data = await res.json();
        if (data.results?.length) {
          setCoords({ lat: data.results[0].latitude, lng: data.results[0].longitude });
        }
      } catch {
        console.warn("Geocoding failed");
      }
    })();
  }, [city]);

  // Custom glowing dot marker — color matches the AQI health badge
  const dotColor = aqiColor || "#22d3ee";
  const customIcon = L.divIcon({
    className: "",
    html: `
      <div style="
        width:18px; height:18px;
        background:${dotColor};
        border-radius:50%;
        border:2px solid rgba(255,255,255,0.8);
        box-shadow: 0 0 14px ${dotColor}, 0 0 4px ${dotColor};
      "></div>`,
    iconSize:   [18, 18],
    iconAnchor: [9, 9],
  });

  return (
    <div style={{ position: "relative" }}>

      {/* Floating hint overlay */}
      <div style={{
        position: "absolute", bottom: 12, left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        background: "rgba(9,9,11,0.75)",
        backdropFilter: "blur(8px)",
        color: "#94a3b8",
        padding: "6px 14px",
        borderRadius: "20px",
        fontSize: "12px",
        border: "1px solid rgba(255,255,255,0.08)",
        pointerEvents: "none",
        whiteSpace: "nowrap"
      }}>
        🌍 Click anywhere on the map to analyze that city
      </div>

      {/* "Analyzing…" toast when user clicks */}
      {clickInfo?.status === "loading" && (
        <div style={{
          position: "absolute", top: 12, left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1001,
          background: "rgba(34,211,238,0.12)",
          border: "1px solid rgba(34,211,238,0.4)",
          color: "#22d3ee",
          padding: "8px 18px",
          borderRadius: "20px",
          fontSize: "13px",
          fontWeight: 600,
          backdropFilter: "blur(8px)",
        }}>
          🔍 Locating city…
        </div>
      )}
      {clickInfo?.status === "found" && (
        <div style={{
          position: "absolute", top: 12, left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1001,
          background: "rgba(34,197,94,0.12)",
          border: "1px solid rgba(34,197,94,0.4)",
          color: "#22c55e",
          padding: "8px 18px",
          borderRadius: "20px",
          fontSize: "13px",
          fontWeight: 600,
          backdropFilter: "blur(8px)",
        }}>
          ✓ Analyzing <strong>{clickInfo.city}</strong>…
        </div>
      )}
      {clickInfo?.status === "notfound" && (
        <div style={{
          position: "absolute", top: 12, left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1001,
          background: "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.3)",
          color: "#ef4444",
          padding: "8px 18px",
          borderRadius: "20px",
          fontSize: "13px",
          backdropFilter: "blur(8px)",
        }}>
          ⚠ No city found at that location. Try clicking near a city.
        </div>
      )}

      <MapContainer
        center={[coords.lat, coords.lng]}
        zoom={10}
        style={{ height: "400px", width: "100%", borderRadius: "12px" }}
      >
        {/* 🛰️ ESRI Satellite Imagery — free, no API key required */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri"
        />
        
        {/* 🏷️ ESRI Labels & Boundaries (Shows city/state/country names over the satellite map) */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          attribution="&copy; Esri &mdash; Boundaries and Places"
        />

        {/* Click-to-analyze handler */}
        <MapClickHandler onCitySelect={onCitySelect} setClickInfo={setClickInfo} />

        {/* Auto-pan when city changes */}
        <MapCenterUpdater coords={coords} />

        {/* Glowing city marker */}
        <Marker position={[coords.lat, coords.lng]} icon={customIcon}>
          <Popup>
            <div style={{ color: "#111", minWidth: "140px", fontFamily: "system-ui, sans-serif" }}>
              <strong style={{ fontSize: "14px" }}>📍 {city}</strong>
              <br />
              <small style={{ color: "#555" }}>Click anywhere to switch city</small>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
