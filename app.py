# app.py — FastAPI backend that exposes /current and /forecast endpoints
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from model import model as model_module
import data_fetcher
import database
import os

app = FastAPI(title="Air Quality Agent")

# allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change to frontend origin in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ForecastRequest(BaseModel):
    city: str
    hours: int = 24

@app.on_event("startup")
def startup_event():
    database.init_db()         # create database tables
    model_module.load_model()  # loads model into memory

@app.get("/current")
async def get_current(city: str):
    """
    Returns latest AQ measurements for a city (from OpenAQ).
    """
    try:
        # Log the search in SQLite
        database.log_search(city)
        
        data = await data_fetcher.fetch_latest_city(city)
        return {"status": "ok", "city": city, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/forecast")
async def forecast(req: ForecastRequest):
    """
    Returns forecasted AQI (or pollutant) for next req.hours hours.
    """
    try:
        # fetch recent history to build features
        history = await data_fetcher.fetch_history(req.city, hours=72)
        preds = model_module.predict_from_history(history, hours=req.hours)
        return {"status": "ok", "city": req.city, "predictions": preds}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history")
async def get_history():
    """
    Returns the most recent city searches from the database.
    """
    try:
        recent = database.get_recent_searches(limit=5)
        return {"status": "ok", "history": recent}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
