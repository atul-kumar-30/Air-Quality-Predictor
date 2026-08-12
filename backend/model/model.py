# model.py — simple training loader + prediction wrapper
import joblib
import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split

MODEL_PATH = os.path.join(os.path.dirname(__file__), "aqi_model.pkl")
_model = None

def load_model():
    global _model
    if os.path.exists(MODEL_PATH):
        _model = joblib.load(MODEL_PATH)
        print("Loaded model from", MODEL_PATH)
    else:
        print("Model file not found. Please run training script to create aqi_model.pkl")

def predict_from_history(history_records, hours=24):
    """
    history_records: list of {datetime, parameter, value}
    We will create a simple feature: recent avg PM2.5 and use persistence + RF to predict next hours.
    For simplicity, predict next 'hours' values as repeating last known or using model if available.
    """
    # convert incoming history to dataframe pivoted by parameter
    df = pd.DataFrame(history_records)
    if df.empty:
        raise ValueError("No history data found for city.")
    df['datetime'] = pd.to_datetime(df['datetime'])
    # pivot to hourly average per parameter
    df.set_index('datetime', inplace=True)
    hourly = df.groupby([pd.Grouper(freq='1h'), 'parameter']).mean().unstack(fill_value=np.nan)
    # flatten columns like ('value','pm25') -> 'pm25'
    hourly.columns = [c[1] for c in hourly.columns]
    hourly = hourly.sort_index().ffill().bfill()
    # select PM2.5 as target if present, else first param
    target_col = None
    for c in ['pm25', 'pm10', 'o3', 'no2', 'so2', 'co']:
        if c in hourly.columns:
            target_col = c
            break
    if target_col is None:
        # fallback to first numeric column
        target_col = hourly.columns[0]
    last_row = hourly.iloc[-1]
    last_val = float(last_row[target_col])
    # if model loaded, use it to forecast; else simple persistence
    global _model
    if _model is None:
        # repeat last seen value
        return [{"hour_from_now": i+1, "pred": round(last_val, 2)} for i in range(hours)]
    else:
        # build features for prediction: we'll use last 24 hours flattened
        target_idx = list(hourly.columns).index(target_col)
        current_hourly_values = hourly.tail(24).ffill().values
        
        preds_list = []
        for i in range(hours):
            # Flatten current 24-hour window
            X_in = current_hourly_values.flatten().reshape(1, -1)
            
            # Pad if we don't have exactly 24 hours of history
            expected_features = 24 * len(hourly.columns)
            if X_in.shape[1] < expected_features:
                pad_len = expected_features - X_in.shape[1]
                X_in = np.concatenate([np.zeros((1, pad_len)), X_in], axis=1)
                
            # Predict next hour
            pred = _model.predict(X_in)[0]
            preds_list.append(pred)
            
            # Slide window forward by 1 hour to predict the hour after that
            new_row = current_hourly_values[-1].copy() # Copy last known values
            new_row[target_idx] = pred # Inject our new prediction for PM2.5
            
            # Remove oldest hour, append newest simulated hour
            current_hourly_values = np.vstack([current_hourly_values[1:], new_row])
            
        return [{"hour_from_now": i+1, "pred": float(round(p, 2))} for i, p in enumerate(preds_list)]
