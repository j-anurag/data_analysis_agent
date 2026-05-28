from typing import List, Dict, Any
from backend.app.tools.registry import registry

@registry.register(
    name="configure_chart",
    description="Analyze query results to recommend and configure the best visualization chart type (Line, Bar, Area, Pie) and axes."
)
def configure_chart(data: List[Dict[str, Any]], title: str = "Analytics Chart") -> Dict[str, Any]:
    """
    Examines list-of-dict data, identifies columns, and returns a JSON specification
    used by the frontend to render Recharts components dynamically.
    """
    if not data:
        return {"error": "No data available to configure a chart."}

    # Extract all keys present in the first row
    first_row = data[0]
    keys = list(first_row.keys())
    
    # Classify keys into numeric and categorical/date
    numeric_keys = []
    date_keys = []
    categorical_keys = []
    
    for key in keys:
        val = first_row[key]
        
        # Check if column name suggests a date
        if "date" in key.lower() or "time" in key.lower() or "month" in key.lower() or "day" in key.lower():
            date_keys.append(key)
            continue
            
        # Try converting to float to see if it's numeric
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            numeric_keys.append(key)
        elif isinstance(val, str):
            try:
                # Try parsing as float
                float(val)
                numeric_keys.append(key)
            except ValueError:
                categorical_keys.append(key)
        else:
            categorical_keys.append(key)
            
    # Default selection strategy
    chart_type = "bar"
    x_axis_key = ""
    series_keys = numeric_keys.copy()
    
    # 1. Determine X-Axis
    if date_keys:
        x_axis_key = date_keys[0]
        chart_type = "area" if len(data) > 10 else "line"
    elif categorical_keys:
        x_axis_key = categorical_keys[0]
        chart_type = "bar"
        # If there are only 2-5 unique entries, Pie might be good
        unique_categories = len(set(str(row.get(x_axis_key, "")) for row in data))
        if unique_categories <= 5 and len(numeric_keys) == 1:
            chart_type = "pie"
    elif keys:
        x_axis_key = keys[0]
        chart_type = "bar"

    # Remove x-axis from series keys to avoid graphing the index/date
    if x_axis_key in series_keys:
        series_keys.remove(x_axis_key)
        
    # If no numeric keys, we count rows or default to first column
    if not series_keys:
        if len(keys) > 1:
            series_keys = [keys[1]]
        else:
            series_keys = [keys[0]]

    # Premium dark theme colors (cyan, purple, emerald, orange, rose, amber)
    premium_colors = ["#06b6d4", "#a855f7", "#10b981", "#f97316", "#f43f5e", "#f59e0b", "#3b82f6"]
    
    series_config = []
    for i, key in enumerate(series_keys[:4]): # Limit to top 4 metrics for clarity
        color = premium_colors[i % len(premium_colors)]
        series_config.append({
            "key": key,
            "color": color,
            "label": key.replace("_", " ").title()
        })

    return {
        "title": title,
        "chart_type": chart_type,
        "xAxisKey": x_axis_key,
        "series": series_config,
        "data": data, # Return the data so the frontend has access to it
        "recommended_layout": {
            "responsive": True,
            "height": 350,
            "grid": True,
            "legend": True,
            "tooltip": True
        }
    }
