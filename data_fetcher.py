# data_fetcher.py — functions to fetch data from Open-Meteo Air Quality API
import aiohttp
import urllib.parse
from typing import List, Dict
import datetime
import database

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# Mapping Open-Meteo fields to the expected format
PARAM_MAP = {
    'pm10': 'pm10',
    'pm2_5': 'pm25',
    'carbon_monoxide': 'co',
    'nitrogen_dioxide': 'no2',
    'sulphur_dioxide': 'so2',
    'ozone': 'o3'
}

async def get_coordinates(city: str, session: aiohttp.ClientSession):
    params = {"name": city, "count": 1}
    async with session.get(GEOCODING_URL, params=params) as resp:
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
        
    async with aiohttp.ClientSession() as session:
        lat, lon = await get_coordinates(city, session)
        
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": ",".join(PARAM_MAP.keys())
        }
        
        async with session.get(AIR_QUALITY_URL, params=params) as resp:
            data = await resp.json()
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
    
    async with aiohttp.ClientSession() as session:
        lat, lon = await get_coordinates(city, session)
        
        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": ",".join(PARAM_MAP.keys()),
            "past_days": days,
            "forecast_days": 0
        }
        
        async with session.get(AIR_QUALITY_URL, params=params) as resp:
            data = await resp.json()
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
            database.set_cached_data(cache_key, out)
            return out
