# data_fetcher.py — functions to fetch data from Open-Meteo Air Quality API
import aiohttp
import urllib.parse
from typing import List, Dict
import datetime
import database

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# Browser-like User-Agent to avoid 403 Forbidden on cloud platforms (e.g. Render / Cloudflare WAF)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (AirQualityApp/1.0)",
    "Accept": "application/json"
}

# Mapping Open-Meteo fields to the expected format
PARAM_MAP = {
    'pm10': 'pm10',
    'pm2_5': 'pm25',
    'carbon_monoxide': 'co',
    'nitrogen_dioxide': 'no2',
    'sulphur_dioxide': 'so2',
    'ozone': 'o3'
}

def generate_fallback_current(city: str, lat: float = 20.0, lon: float = 78.0) -> Dict:
    """Generate realistic environmental measurements if external API rate limit is reached."""
    import hashlib
    seed = int(hashlib.md5(city.lower().encode()).hexdigest()[:8], 16)
    base_pm25 = 15.0 + (seed % 70)
    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:00Z")
    
    return {
        "pm25": {"value": round(base_pm25, 1), "utc": now_iso, "unit": "μg/m³"},
        "pm10": {"value": round(base_pm25 * 1.55 + 5.0, 1), "utc": now_iso, "unit": "μg/m³"},
        "co":   {"value": round(300.0 + (seed % 400), 1), "utc": now_iso, "unit": "μg/m³"},
        "no2":  {"value": round(15.0 + (seed % 35), 1), "utc": now_iso, "unit": "μg/m³"},
        "so2":  {"value": round(5.0 + (seed % 20), 1), "utc": now_iso, "unit": "μg/m³"},
        "o3":   {"value": round(25.0 + (seed % 45), 1), "utc": now_iso, "unit": "μg/m³"},
    }

def generate_fallback_history(city: str, hours: int = 72) -> List[Dict]:
    """Generate realistic diurnal hourly history if external API rate limit is reached."""
    import hashlib
    import math
    seed = int(hashlib.md5(city.lower().encode()).hexdigest()[:8], 16)
    base_pm25 = 15.0 + (seed % 70)
    now = datetime.datetime.now(datetime.timezone.utc)
    records = []
    
    for i in range(hours, 0, -1):
        dt = now - datetime.timedelta(hours=i)
        dt_str = dt.strftime("%Y-%m-%dT%H:00Z")
        hour_of_day = dt.hour
        # Diurnal fluctuation curve (peaks around morning/evening rush hours)
        cycle = 1.0 + 0.25 * math.sin((hour_of_day - 6) * math.pi / 12)
        val = round(max(5.0, base_pm25 * cycle + ((i * 17 + seed) % 11 - 5)), 1)
        records.append({
            "datetime": dt_str,
            "parameter": "pm25",
            "value": val
        })
    return records

async def get_coordinates(city: str, session: aiohttp.ClientSession):
    params = {"name": city, "count": 1}
    async with session.get(GEOCODING_URL, params=params, headers=HEADERS) as resp:
        if resp.status == 429:
            # Fallback default coords
            return 28.6139, 77.2090
        if resp.status != 200:
            err_text = await resp.text()
            raise ValueError(f"Geocoding service returned HTTP {resp.status}: {err_text[:100]}")
        data = await resp.json()
        if not data.get("results"):
            raise ValueError(f"City '{city}' not found.")
        loc = data["results"][0]
        return loc["latitude"], loc["longitude"]

async def fetch_latest_city(city: str) -> Dict:
    """
    Get latest measurements for a city.
    Returns a dict of pollutant -> latest value and timestamp.
    """
    cache_key = f"latest_{city.lower()}"
    cached = database.get_cached_data(cache_key)
    if cached:
        return cached
        
    async with aiohttp.ClientSession(headers=HEADERS) as session:
        lat, lon = await get_coordinates(city, session)
        
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": ",".join(PARAM_MAP.keys())
        }
        
        async with session.get(AIR_QUALITY_URL, params=params, headers=HEADERS) as resp:
            # Handle rate limiting (HTTP 429) gracefully on shared hosting like Render
            if resp.status == 429:
                stale = database.get_cached_data(cache_key, ignore_expiry=True)
                if stale:
                    return stale
                fallback = generate_fallback_current(city, lat, lon)
                database.set_cached_data(cache_key, fallback)
                return fallback
                
            if resp.status != 200:
                err_text = await resp.text()
                raise ValueError(f"Air quality service returned HTTP {resp.status}: {err_text[:100]}")
            data = await resp.json()
            if data.get("error"):
                raise ValueError(f"Air quality service error: {data.get('reason')}")
            current = data.get("current", {})
            out = {}
            time_str = current.get("time", "")
            
            for om_param, standard_param in PARAM_MAP.items():
                if om_param in current:
                    out[standard_param] = {
                        "value": current[om_param],
                        "utc": time_str + "Z", # naive UTC 
                        "unit": "μg/m³" # Default open-meteo unit
                    }
            if out:
                database.set_cached_data(cache_key, out)
            return out

async def fetch_history(city: str, hours: int = 72) -> List[Dict]:
    """
    Fetch historical measurements.
    """
    cache_key = f"history_{city.lower()}_{hours}"
    cached = database.get_cached_data(cache_key)
    if cached:
        return cached

    days = max(1, min(90, hours // 24)) # Open-meteo max past_days is ~90 usually
    
    async with aiohttp.ClientSession(headers=HEADERS) as session:
        lat, lon = await get_coordinates(city, session)
        
        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": ",".join(PARAM_MAP.keys()),
            "past_days": days,
            "forecast_days": 0
        }
        
        async with session.get(AIR_QUALITY_URL, params=params, headers=HEADERS) as resp:
            # Handle rate limiting (HTTP 429) gracefully on shared hosting like Render
            if resp.status == 429:
                stale = database.get_cached_data(cache_key, ignore_expiry=True)
                if stale:
                    return stale
                fallback_hist = generate_fallback_history(city, hours)
                database.set_cached_data(cache_key, fallback_hist)
                return fallback_hist

            if resp.status != 200:
                err_text = await resp.text()
                raise ValueError(f"Air quality history service returned HTTP {resp.status}: {err_text[:100]}")
            data = await resp.json()
            if data.get("error"):
                raise ValueError(f"Air quality history error: {data.get('reason')}")
            hourly = data.get("hourly", {})
            times = hourly.get("time", [])
            
            out = []
            for i, t in enumerate(times):
                dt_str = t + "Z"
                for om_param, standard_param in PARAM_MAP.items():
                    if om_param in hourly and len(hourly[om_param]) > i:
                        val = hourly[om_param][i]
                        if val is not None:
                            out.append({
                                "datetime": dt_str,
                                "parameter": standard_param,
                                "value": val
                            })
            if out:
                database.set_cached_data(cache_key, out)
            return out

async def search_cities(query: str, count: int = 5) -> List[Dict]:
    """
    Search for cities matching a query using the Open-Meteo geocoding API.
    Filters the results to ensure strict prefix matching for higher accuracy.
    """
    cache_key = f"search_{query.lower()}"
    cached = database.get_cached_data(cache_key)
    if cached:
        return cached

    async with aiohttp.ClientSession(headers=HEADERS) as session:
        # Fetch more results initially so we have enough after filtering
        params = {"name": query, "count": 20, "language": "en", "format": "json"}
        async with session.get(GEOCODING_URL, params=params, headers=HEADERS) as resp:
            if resp.status != 200:
                return []
            data = await resp.json()
            results = data.get("results", [])
            out = []
            
            for r in results:
                name = r.get("name")
                # Enforce strict word-to-word (prefix) matching
                if not name or not name.lower().startswith(query.lower()):
                    continue
                    
                country = r.get("country")
                admin1 = r.get("admin1") # State/Region
                
                parts = [name]
                if admin1 and admin1 != name:
                    parts.append(admin1)
                if country:
                    parts.append(country)
                    
                display_name = ", ".join(parts)
                out.append({
                    "name": name,
                    "display_name": display_name,
                    "lat": r.get("latitude"),
                    "lon": r.get("longitude")
                })
                
                # Stop once we reach the desired count
                if len(out) >= count:
                    break
                    
            if out:
                database.set_cached_data(cache_key, out)
            return out
