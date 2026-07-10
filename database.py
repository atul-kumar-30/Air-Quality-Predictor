import sqlite3
import json
from datetime import datetime
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "app.db")

def init_db():
    """Create the SQLite database and necessary tables if they don't exist."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Table for caching Open-Meteo API responses
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS api_cache (
            city TEXT PRIMARY KEY,
            data TEXT,
            timestamp DATETIME
        )
    """)
    
    # Table for storing user search history
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS search_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            city TEXT,
            searched_at DATETIME
        )
    """)
    
    conn.commit()
    conn.close()

def get_cached_data(city: str):
    """Retrieve data from cache if it exists and is less than 1 hour old."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # We store cities in lowercase for consistency
    city_lower = city.strip().lower()
    cursor.execute("SELECT data, timestamp FROM api_cache WHERE city = ?", (city_lower,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        data_json, timestamp_str = row
        timestamp = datetime.fromisoformat(timestamp_str)
        
        # Check if cache is older than 60 minutes
        delta = datetime.now() - timestamp
        if delta.total_seconds() < 3600:
            return json.loads(data_json)
            
    return None

def set_cached_data(city: str, data: dict):
    """Save data to cache."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    city_lower = city.strip().lower()
    data_json = json.dumps(data)
    timestamp_str = datetime.now().isoformat()
    
    cursor.execute("""
        INSERT OR REPLACE INTO api_cache (city, data, timestamp)
        VALUES (?, ?, ?)
    """, (city_lower, data_json, timestamp_str))
    
    conn.commit()
    conn.close()

def log_search(city: str):
    """Log a city search to the history table."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Optional: Delete older duplicates so it only shows up once in recent history
    city_clean = city.strip().title()
    cursor.execute("DELETE FROM search_history WHERE city = ?", (city_clean,))
    
    cursor.execute("""
        INSERT INTO search_history (city, searched_at)
        VALUES (?, ?)
    """, (city_clean, datetime.now().isoformat()))
    
    conn.commit()
    conn.close()

def get_recent_searches(limit: int = 5):
    """Get the most recently searched cities."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT city FROM search_history
        ORDER BY searched_at DESC
        LIMIT ?
    """, (limit,))
    
    rows = cursor.fetchall()
    conn.close()
    
    return [row[0] for row in rows]
