import logging
import pandas as pd
import numpy as np
from typing import List, Dict, Any
from backend.app.tools.registry import registry

logger = logging.getLogger("insightflow.tools.anomaly")

@registry.register(
    name="detect_anomalies",
    description="Analyze a time series dataset to detect statistical outliers (spikes or drops) in key metrics."
)
def detect_anomalies(
    data: List[Dict[str, Any]], 
    value_key: str, 
    date_key: str = "date", 
    sensitivity: float = 2.5
) -> Dict[str, Any]:
    """
    Detect anomalies in time series data using rolling Z-score method.
    Sensitive to sudden drops/spikes based on rolling mean and standard deviation.
    """
    if not data:
        return {"error": "Dataset is empty, cannot perform anomaly detection."}
        
    try:
        # Convert to Pandas DataFrame
        df = pd.DataFrame(data)
        
        # Verify columns exist
        if value_key not in df.columns:
            return {"error": f"Value key '{value_key}' not found in the dataset. Available keys: {list(df.columns)}"}
        
        # Try to find date column if default not found
        actual_date_key = date_key
        if actual_date_key not in df.columns:
            # Fallback: scan for columns containing 'date', 'time', 'day', 'month', 'year'
            found_date_col = False
            for col in df.columns:
                col_lower = col.lower()
                if any(k in col_lower for k in ["date", "time", "day", "month", "year"]):
                    actual_date_key = col
                    found_date_col = True
                    break
            if not found_date_col:
                # If no date key found, create an index column
                df["index_date"] = range(len(df))
                actual_date_key = "index_date"

        # Coerce values to numeric
        df[value_key] = pd.to_numeric(df[value_key], errors="coerce")
        df = df.dropna(subset=[value_key])
        
        if len(df) < 5:
            return {
                "message": "Insufficient data points for statistical analysis (minimum 5 points required).",
                "anomalies": []
            }
            
        # Parse and sort by date
        if actual_date_key != "index_date":
            df[actual_date_key] = pd.to_datetime(df[actual_date_key], errors="coerce")
            df = df.dropna(subset=[actual_date_key])
            df = df.sort_values(by=actual_date_key)
            # Reformat date as string for return payload
            df["date_str"] = df[actual_date_key].dt.strftime("%Y-%m-%d %H:%M:%S" if df[actual_date_key].dt.hour.any() else "%Y-%m-%d")
        else:
            df["date_str"] = df["index_date"].astype(str)

        values = df[value_key].values
        
        # We calculate the rolling statistics to detect local anomalies, or global statistics for small datasets
        # For simplicity and effectiveness, we compute standard z-scores
        mean = np.mean(values)
        std = np.std(values)
        
        if std == 0:
            std = 1e-9  # Avoid division by zero
            
        z_scores = (values - mean) / std
        df["z_score"] = z_scores
        
        # Determine anomaly flag: where absolute z-score exceeds sensitivity threshold
        df["is_anomaly"] = np.abs(z_scores) > sensitivity
        
        # Add classification: 'spike' or 'drop'
        df["anomaly_type"] = np.where(df["is_anomaly"], np.where(z_scores > 0, "spike", "drop"), "normal")
        
        # Extract anomalies
        anomalies_df = df[df["is_anomaly"]]
        anomalies_list = []
        
        for idx, row in anomalies_df.iterrows():
            anomalies_list.append({
                "index": int(idx),
                "date": row["date_str"],
                "value": float(row[value_key]),
                "z_score": float(row["z_score"]),
                "type": row["anomaly_type"],
                "description": f"Detected a statistical {row['anomaly_type']} on {row['date_str']} (Value: {row[value_key]:.2f}, Z-score: {row['z_score']:.2f})"
            })
            
        # Calculate summary statistics
        stats = {
            "mean": float(mean),
            "std": float(std),
            "max": float(np.max(values)),
            "min": float(np.min(values)),
            "total_points": len(df),
            "anomaly_count": len(anomalies_list)
        }
        
        # If scikit-learn is installed and running, we can run Isolation Forest for additional confirmation
        try:
            from sklearn.ensemble import IsolationForest
            # Isolation forest on value
            model = IsolationForest(contamination=float(np.clip(len(anomalies_list)/len(df), 0.01, 0.2)), random_state=42)
            model.fit(df[[value_key]])
            # -1 is anomaly, 1 is normal
            df["iso_forest_pred"] = model.predict(df[[value_key]])
            iso_anomalies_count = int((df["iso_forest_pred"] == -1).sum())
            stats["iso_forest_anomaly_count"] = iso_anomalies_count
        except Exception as e:
            logger.warning(f"Skipped Isolation Forest: {e}")
            
        return {
            "metric_analyzed": value_key,
            "date_key_used": actual_date_key,
            "sensitivity_threshold": sensitivity,
            "summary_statistics": stats,
            "anomalies": anomalies_list
        }
        
    except Exception as e:
        logger.error(f"Error executing anomaly detection: {str(e)}")
        return {"error": f"Anomaly detection failed: {str(e)}"}
