import React, { useState, useEffect } from "react";
import axios from "axios";
import { Line } from "react-chartjs-2";
import MapView from "./MapView";
import 'chart.js/auto';

// What each pollutant means (shown as tooltip on hover)
const POLLUTANT_INFO = {
  pm25: { label: "PM2.5", desc: "Fine dust particles — most dangerous for lungs. Main air quality indicator.", unit: "μg/m³" },
  pm10: { label: "PM10", desc: "Coarser dust & pollen particles. Can irritate airways.", unit: "μg/m³" },
  co:   { label: "CO",   desc: "Carbon Monoxide — odourless, toxic gas from vehicle exhausts.", unit: "μg/m³" },
  no2:  { label: "NO₂",  desc: "Nitrogen Dioxide — from traffic & power plants. Causes respiratory issues.", unit: "μg/m³" },
  so2:  { label: "SO₂",  desc: "Sulphur Dioxide — from burning coal & oil. Causes acid rain.", unit: "μg/m³" },
  o3:   { label: "O₃",   desc: "Ground-level Ozone — forms from sunlight + pollutants. Harmful to breathe.", unit: "μg/m³" },
};

// Calculate AQI health category from PM2.5 value (WHO / US EPA standards)
function getAQIStatus(pm25) {
  if (pm25 === null || pm25 === undefined) return null;
  if (pm25 <= 12)  return { label: "Good",              color: "#22c55e", bg: "rgba(34,197,94,0.15)",   desc: "Air quality is excellent. Safe for everyone including children and elderly." };
  if (pm25 <= 35)  return { label: "Moderate",          color: "#facc15", bg: "rgba(250,204,21,0.15)",  desc: "Air quality is acceptable. Unusually sensitive people should limit prolonged outdoor activity." };
  if (pm25 <= 55)  return { label: "Unhealthy for Sensitive Groups", color: "#f97316", bg: "rgba(249,115,22,0.15)", desc: "Children, elderly, and people with lung/heart disease should reduce outdoor activity." };
  if (pm25 <= 150) return { label: "Unhealthy",         color: "#ef4444", bg: "rgba(239,68,68,0.15)",   desc: "Everyone may begin to experience health effects. Sensitive groups should avoid outdoor activity." };
  if (pm25 <= 250) return { label: "Very Unhealthy",    color: "#a855f7", bg: "rgba(168,85,247,0.15)",  desc: "Health alert! Everyone should avoid prolonged outdoor exertion." };
  return             { label: "Hazardous",              color: "#7f1d1d", bg: "rgba(127,29,29,0.3)",    desc: "Emergency conditions. Everyone should avoid all outdoor activity." };
}

export default function Dashboard() {
  const [searchInput, setSearchInput] = useState("Delhi");
  const [activeCity, setActiveCity] = useState("Delhi");
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchData(cityToFetch) {
    const target = cityToFetch || searchInput;
    if (!target) return;
    
    setActiveCity(target);
    setSearchInput(target);
    setLoading(true);
    setError("");
    
    try {
      const resCurrent = await axios.get(`http://localhost:8000/current?city=${encodeURIComponent(target)}`);
      if (resCurrent.data.status === "ok") setCurrent(resCurrent.data.data);

      const resForecast = await axios.post(`http://localhost:8000/forecast`, { city: target, hours: 24 });
      if (resForecast.data.status === "ok") setPredictions(resForecast.data.predictions);

      // Refresh history after a successful search
      fetchHistory();
    } catch (err) {
      console.error(err);
      setError("Failed to fetch data. Ensure the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchHistory() {
    try {
      const res = await axios.get(`http://localhost:8000/history`);
      if (res.data.status === "ok") setHistory(res.data.history);
    } catch (err) {
      console.error("Failed to fetch history", err);
    }
  }

  useEffect(() => { 
    fetchData("Delhi"); 
    fetchHistory();
    /* eslint-disable-next-line */ 
  }, []);

  // Called when user clicks a location on the map
  function handleMapCitySelect(selectedCity) {
    fetchData(selectedCity);
  }

  // Get PM2.5 value for health status badge
  const pm25Value = current?.pm25?.value ?? null;
  const aqiStatus = getAQIStatus(pm25Value);

  // Max predicted PM2.5 in next 24h (for the warning message)
  const maxPred = predictions.length ? Math.max(...predictions.map(p => p.pred)) : null;
  const maxAqiStatus = getAQIStatus(maxPred);

  const chartData = {
    labels: predictions.map(p => `+${p.hour_from_now}h`),
    datasets: [{
      label: "Predicted PM2.5 (μg/m³)",
      data: predictions.map(p => p.pred),
      borderColor: "#22d3ee",
      backgroundColor: "rgba(34, 211, 238, 0.1)",
      borderWidth: 2.5,
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: "#22d3ee",
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(9,9,11,0.9)",
        titleColor: "#22d3ee",
        bodyColor: "#f8fafc",
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => ` ${ctx.parsed.y.toFixed(1)} μg/m³  —  ${getAQIStatus(ctx.parsed.y)?.label ?? ""}`,
        }
      },
      // Draw WHO "safe" threshold line at 15 μg/m³
      annotation: undefined,
    },
    scales: {
      x: {
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: { color: "#64748b", maxTicksLimit: 8, font: { size: 11 } }
      },
      y: {
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: { color: "#64748b", font: { size: 11 } },
        title: { display: true, text: "PM2.5 (μg/m³)", color: "#64748b", font: { size: 12 } }
      }
    }
  };

  return (
    <div className="dashboard">

      {/* Search Bar */}
      <div className="controls" style={{ marginBottom: "16px" }}>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Enter any city (e.g. Tokyo, London, Delhi, New York)"
          onKeyDown={e => e.key === "Enter" && fetchData()}
        />
        <button onClick={() => fetchData()}>{loading ? "Analyzing…" : "Analyze City"}</button>
      </div>
      
      {/* Recent Searches */}
      {history.length > 0 && (
        <div className="recent-searches" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px", alignItems: "center" }}>
          <span style={{ color: "#64748b", fontSize: "13px", fontWeight: "600" }}>Recent:</span>
          {history.map((h, i) => (
            <button 
              key={i}
              onClick={() => fetchData(h)}
              style={{
                background: "rgba(34, 211, 238, 0.1)",
                border: "1px solid rgba(34, 211, 238, 0.3)",
                color: "#22d3ee",
                padding: "4px 12px",
                borderRadius: "16px",
                fontSize: "12px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = "rgba(34, 211, 238, 0.2)" }}
              onMouseOut={(e) => { e.currentTarget.style.background = "rgba(34, 211, 238, 0.1)" }}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {/* AQI Health Status Banner */}
      {aqiStatus && (
        <div className="aqi-banner" style={{ background: aqiStatus.bg, borderColor: aqiStatus.color }}>
          <div className="aqi-dot" style={{ background: aqiStatus.color }} />
          <div>
            <strong style={{ color: aqiStatus.color }}>Air Quality: {aqiStatus.label}</strong>
            <p>{aqiStatus.desc}</p>
          </div>
          <div className="aqi-value" style={{ color: aqiStatus.color }}>
            PM2.5: {pm25Value?.toFixed(1)} μg/m³
          </div>
        </div>
      )}

      <div className="grid">

        {/* Current Measurements Card */}
        <div className="card">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Live Pollutant Readings
          </h3>
          <p className="card-subtitle">Sensor data for <strong>{activeCity}</strong> right now. Each box shows a different harmful gas or particle in the air.</p>

          {loading && !current
            ? <p style={{ color: "#64748b" }}>Fetching sensor data…</p>
            : current
              ? (
                <ul className="metrics">
                  {Object.entries(current).map(([k, v]) => {
                    const info = POLLUTANT_INFO[k] || { label: k.toUpperCase(), desc: "", unit: v.unit };
                    return (
                      <li key={k} title={info.desc}>
                        <strong>{info.label}</strong>
                        <span>{Math.round(v.value * 10) / 10} <small>{v.unit}</small></span>
                        <em className="pollutant-desc">{info.desc}</em>
                      </li>
                    );
                  })}
                </ul>
              )
              : <p style={{ color: "#64748b" }}>No sensor data available.</p>
          }
        </div>

        {/* 24-Hour Forecast Card */}
        <div className="card">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            24-Hour AI Forecast
          </h3>
          <p className="card-subtitle">
            This chart predicts how the PM2.5 level will change over the <strong>next 24 hours</strong>.<br />
            X-axis = hours from now (+1h to +24h). &nbsp;Y-axis = pollution level (higher = worse air).
          </p>

          {maxAqiStatus && predictions.length > 0 && (
            <div className="forecast-warning" style={{ borderColor: maxAqiStatus.color, color: maxAqiStatus.color }}>
              ⚠ Peak forecast: <strong>{maxPred?.toFixed(1)} μg/m³</strong> ({maxAqiStatus.label})
            </div>
          )}

          {predictions.length
            ? <div style={{ height: "230px", marginTop: "12px" }}><Line data={chartData} options={chartOptions} /></div>
            : <p style={{ color: "#64748b" }}>AI model is generating forecast…</p>
          }
        </div>

        {/* Map Card */}
        <div className="card full">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            City Location Map
          </h3>
          <p className="card-subtitle">Showing the geographical location of <strong>{activeCity}</strong> on the map.</p>
          <div style={{ borderRadius: "12px", overflow: "hidden", marginTop: "12px" }}>
            <MapView city={activeCity} onCitySelect={handleMapCitySelect} aqiColor={aqiStatus?.color} />
          </div>
        </div>

      </div>
    </div>
  );
}
