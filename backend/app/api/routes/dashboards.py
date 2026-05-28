from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.app.db.session import get_db
from backend.app.models.models import Dashboard
from backend.app.api.schemas.schemas import DashboardCreate, DashboardResponse
from backend.app.api.routes.auth import get_current_user
from backend.app.models.models import User

router = APIRouter(prefix="/dashboards", tags=["dashboards"])

@router.get("", response_model=List[DashboardResponse])
def list_dashboards(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch all saved dashboards."""
    return db.query(Dashboard).order_by(Dashboard.created_at.desc()).all()

@router.get("/{dashboard_id}", response_model=DashboardResponse)
def get_dashboard(dashboard_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch details of a specific saved dashboard layout."""
    dash = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dash

@router.post("", response_model=DashboardResponse)
def create_dashboard(
    payload: DashboardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Manually save a new dashboard layout."""
    dash = Dashboard(
        name=payload.name,
        layout_config=payload.layout_config
    )
    db.add(dash)
    db.commit()
    db.refresh(dash)
    return dash
