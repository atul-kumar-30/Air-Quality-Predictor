import asyncio
import pandas as pd
from data_fetcher import fetch_history
import os

async def main():
    city = "Delhi"
    hours_to_fetch = 720 # 30 days
    print(f"Fetching {hours_to_fetch} hours of historical data for {city} from OpenAQ...")
    
    # fetch_history is an async function in data_fetcher.py
    data = await fetch_history(city, hours=hours_to_fetch)
    
    if not data:
        print("Failed to fetch data or no data returned.")
        return
        
    df = pd.DataFrame(data)
    
    # Ensure data directory exists
    os.makedirs("data", exist_ok=True)
    
    # Save to CSV
    output_path = "data/aqi_hourly.csv"
    df.to_csv(output_path, index=False)
    
    print(f"Successfully saved {len(df)} records to {output_path}")
    print("Preview of data:")
    print(df.head())

if __name__ == "__main__":
    asyncio.run(main())
