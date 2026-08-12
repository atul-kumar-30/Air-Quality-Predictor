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

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function Dashboard() {
  const [searchInput, setSearchInput] = useState("");
  const [activeCity, setActiveCity] = useState("");
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  async function fetchData(cityToFetch) {
    const target = cityToFetch || searchInput;
    if (!target) return;
    
    setActiveCity(target);
    setSearchInput(target);
    setLoading(true);
    setError("");
    setShowSuggestions(false);
    
    try {
      const resCurrent = await axios.get(`${API_URL}/current?city=${encodeURIComponent(target)}`);
      if (resCurrent.data.status === "ok") setCurrent(resCurrent.data.data);

      const resForecast = await axios.post(`${API_URL}/forecast`, { city: target, hours: 24 });
      if (resForecast.data.status === "ok") setPredictions(resForecast.data.predictions);

      // Save to local history
      saveToHistory(target);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch data. Ensure the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  function loadHistory() {
    const saved = localStorage.getItem("aqi_recent_cities");
    if (saved) setHistory(JSON.parse(saved));
  }

  function saveToHistory(city) {
    const saved = localStorage.getItem("aqi_recent_cities");
    let hist = saved ? JSON.parse(saved) : [];
    // Add new city to start, remove duplicates, keep max 5
    hist = [city, ...hist.filter(c => c.toLowerCase() !== city.toLowerCase())].slice(0, 5);
    localStorage.setItem("aqi_recent_cities", JSON.stringify(hist));
    setHistory(hist);
  }

  useEffect(() => { 
    loadHistory();
    /* eslint-disable-next-line */ 
  }, []);

  // Autocomplete debounce hook
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchInput && searchInput.length >= 2 && searchInput !== activeCity) {
        try {
          const res = await axios.get(`${API_URL}/search?q=${encodeURIComponent(searchInput)}`);
          if (res.data.status === "ok") {
            setSuggestions(res.data.results);
            setShowSuggestions(true);
          }
        } catch (e) {
          console.error("Autocomplete error", e);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 100);

    return () => clearTimeout(delayDebounceFn);
  }, [searchInput, activeCity]);

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
      <header className="header" style={{ position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid var(--card-border)" }}>
        <div className="header-inner" style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1>Air Quality Agent</h1>
            <p className="sub">Real-time monitoring · Forecasting · Alerts</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flex: 1, maxWidth: "500px" }}>
            <div className="controls" style={{ marginBottom: 0, width: "100%", justifyContent: "flex-end" }}>
              <div style={{ position: "relative", flex: 1, maxWidth: "400px" }}>
                <input
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onFocus={() => { if(suggestions.length) setShowSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Search city..."
                  onKeyDown={e => e.key === "Enter" && fetchData()}
                  autoComplete="off"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="suggestions-dropdown">
                    {suggestions.map((sug, i) => (
                      <li 
                        key={i} 
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchInput(sug.name);
                          fetchData(sug.name);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        {sug.display_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button onClick={() => fetchData()}>{loading ? "Analyzing…" : "Analyze City"}</button>
            </div>

            {/* Recent Searches */}
            {history.length > 0 && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px", alignItems: "center", justifyContent: "flex-end" }}>
                <span style={{ color: "#64748b", fontSize: "13px", fontWeight: "600" }}>Recent:</span>
                {history.map((h, i) => (
                  <button key={i} className="recent-tag" onClick={() => fetchData(h)}>
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        {error && <div className="error-banner">{error}</div>}

      {!activeCity && !loading && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#747f9e", background: "var(--card-bg)", backdropFilter: "var(--glass-blur)", borderRadius: "20px", border: "1px dashed rgba(255,255,255,0.15)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: "20px", color: "var(--accent)", opacity: 0.8 }}>
             <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <h3 style={{ margin: "0 0 12px 0", color: "#fff", fontWeight: 600, fontSize: "24px", fontFamily: "Outfit, sans-serif" }}>Welcome to Air Quality Agent</h3>
          <p style={{ margin: 0, fontSize: "15px", maxWidth: "400px", marginInline: "auto", lineHeight: "1.6" }}>Search for any city above to view real-time pollution data and AI-powered 24-hour forecasts.</p>
        </div>
      )}

      {activeCity && (
        <>
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

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "16px" }}>
            
            {/* ─── ROW 1, COL 1: Live Pollutant Readings ─── */}
            <div className="card" style={{ display: "flex", flexDirection: "column" }}>
              <h3>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                Live Pollutant Readings
              </h3>
              <p className="card-subtitle">Sensor data for <strong>{activeCity}</strong> right now. Each box shows a different harmful gas or particle in the air.</p>

              {loading && !current
                ? <p style={{ color: "#64748b" }}>Fetching sensor data…</p>
                : current
                  ? (
                    <ul className="metrics" style={{ flex: 1, marginBottom: 0 }}>
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

            {/* ─── ROW 1, COL 2: City Location Map ─── */}
            <div className="card" style={{ display: "flex", flexDirection: "column", padding: "20px" }}>
              <h3 style={{ marginBottom: "8px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                City Location Map
              </h3>
              <p className="card-subtitle" style={{ marginBottom: "0" }}>Showing the geographical location of <strong>{activeCity}</strong> on the map.</p>
              
              <div style={{ flex: 1, minHeight: 0, position: "relative", borderRadius: "12px", overflow: "hidden", marginTop: "12px" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
                  <MapView city={activeCity} onCitySelect={handleMapCitySelect} aqiColor={aqiStatus?.color} />
                </div>
              </div>
            </div>

            {/* ─── ROW 2, COL 1: 24-Hour AI Forecast ─── */}
            <div className="card" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
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
                ? <div style={{ flex: 1, position: "relative", minHeight: "180px", width: "100%", minWidth: 0, marginTop: "12px" }}><Line data={chartData} options={chartOptions} /></div>
                : <p style={{ color: "#64748b" }}>AI model is generating forecast…</p>
              }
            </div>

            {/* ─── ROW 2, COL 2: Pollutant Explanations ─── */}
            <div className="card" style={{ display: "flex", flexDirection: "column", padding: "20px" }}>
              <h3>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4l2-9 5 18 3-9h6"/></svg>
                Understanding the Pollutants
              </h3>
              <p className="card-subtitle" style={{ marginTop: "4px" }}>Here is what the 6 measurements in the top-left box mean.</p>
              
              <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1 }}>
                {Object.entries(POLLUTANT_INFO).map(([key, info]) => (
                  <div key={key} style={{ padding: "8px 12px", background: "rgba(255,255,255,0.05)", borderRadius: "6px", borderLeft: "3px solid #22d3ee" }}>
                    <strong style={{ color: "#22d3ee", fontSize: "14px" }}>{info.label}</strong>
                    <p style={{ margin: 0, fontSize: "13px", color: "#cbd5e1", lineHeight: "1.4" }}>{info.desc}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </>
      )}
      </main>
    </div>
  );
}
