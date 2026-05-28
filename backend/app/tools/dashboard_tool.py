from sqlalchemy.orm import Session
from backend.app.models.models import Dashboard
from backend.app.tools.registry import registry

@registry.register(
    name="generate_dashboard",
    description="Assemble and save a dashboard layout (KPI cards + charts) to the enterprise database."
)
def generate_dashboard(name: str, layout_config: dict, db: Session) -> dict:
    """
    Saves a dashboard definition containing widget placements, metric values, 
    and chart layouts to the database so it can be viewed on the client.
    """
    try:
        new_dashboard = Dashboard(
            name=name,
            layout_config=layout_config
        )
        db.add(new_dashboard)
        db.commit()
        db.refresh(new_dashboard)
        
        return {
            "message": f"Dashboard '{name}' generated and saved successfully.",
            "dashboard_id": new_dashboard.id,
            "layout_config": layout_config
        }
    except Exception as e:
        db.rollback()
        return {"error": f"Failed to save dashboard: {str(e)}"}
