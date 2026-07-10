# train_model.py — Training pipeline using historical OpenAQ data
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
import joblib
import os

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "aqi_hourly.csv")
MODEL_OUT = os.path.join(os.path.dirname(__file__), "aqi_model.pkl")

def main():
    if not os.path.exists(DATA_PATH):
        print(f"Training data not found at {DATA_PATH}. Please run fetch_data.py first.")
        return
        
    print("Loading raw historical data...")
    df = pd.read_csv(DATA_PATH)
    if df.empty:
        print("Data is empty.")
        return
        
    df['datetime'] = pd.to_datetime(df['datetime'])
    
    # Pivot to hourly average per parameter (same as in model.py)
    df.set_index('datetime', inplace=True)
    hourly = df.groupby([pd.Grouper(freq='1h'), 'parameter']).mean().unstack(fill_value=np.nan)
    hourly.columns = [c[1] for c in hourly.columns]
    hourly = hourly.sort_index().ffill().bfill()
    
    # We want to predict PM2.5 in the NEXT hour.
    target_col = 'pm25'
    if target_col not in hourly.columns:
        if len(hourly.columns) > 0:
            target_col = hourly.columns[0]
        else:
            print("No valid pollutants found.")
            return

    print(f"Using '{target_col}' as the prediction target.")
    
    # Create the target: shift by -1 so row T has target T+1
    hourly['target'] = hourly[target_col].shift(-1)
    
    # Drop the last row since it doesn't have a target
    hourly = hourly.dropna()
    
    # Features (X) and Target (y)
    X_raw = hourly.drop(columns=['target']).values
    y = hourly['target'].values
    
    # In model.py, we use a flattened window of the last 24 hours to predict.
    # To train properly, we should create a rolling window of 24 hours.
    num_features = X_raw.shape[1]
    window_size = 24
    
    X_windows = []
    y_windows = []
    
    for i in range(window_size, len(X_raw)):
        # Flatten the previous 24 hours
        window = X_raw[i - window_size:i].flatten()
        
        # Ensure padding matches model.py expectations if columns changed
        pad_len = 24 * num_features - len(window)
        if pad_len > 0:
            window = np.concatenate([np.zeros(pad_len), window])
            
        X_windows.append(window)
        y_windows.append(y[i])
        
    X = np.array(X_windows)
    y = np.array(y_windows)
    
    print(f"Created {len(X)} training samples with a 24-hour lookback window.")
    
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)
    
    model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    print("Training Random Forest model (this may take a moment)...")
    model.fit(X_train, y_train)
    
    score = model.score(X_val, y_val)
    print(f"Validation R^2 Score: {score:.3f}")
    
    print("Saving model to", MODEL_OUT)
    joblib.dump(model, MODEL_OUT)
    print("Training complete!")

if __name__ == "__main__":
    main()
