from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.app.db.session import get_db
from backend.app.models.models import Report
from backend.app.api.schemas.schemas import ReportResponse
from backend.app.api.routes.auth import get_current_user
from backend.app.models.models import User

router = APIRouter(prefix="/reports", tags=["reports"])

@router.get("", response_model=List[ReportResponse])
def list_reports(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all generated export reports."""
    return db.query(Report).order_by(Report.created_at.desc()).all()

@router.get("/{report_id}", response_model=ReportResponse)
def get_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch metadata of a specific report."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report
