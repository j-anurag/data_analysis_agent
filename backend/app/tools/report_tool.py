import os
import csv
import datetime
from sqlalchemy.orm import Session
from backend.app.models.models import Report
from backend.app.tools.registry import registry

@registry.register(
    name="generate_report",
    description="Export a query dataset to a downloadable CSV report file and log it in the database."
)
def generate_report(title: str, data: list, db: Session) -> dict:
    """
    Takes a dataset (list of dicts) and generates a physical CSV file in the reports directory,
    saving the reference in the database.
    """
    if not data:
        return {"error": "No data to export to report."}

    try:
        # Create reports directory if it doesn't exist
        # We save it in a folder served statically by FastAPI
        static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../static"))
        reports_dir = os.path.join(static_dir, "reports")
        os.makedirs(reports_dir, exist_ok=True)
        
        # Clean title for filename
        safe_title = "".join(c for c in title if c.isalnum() or c in (" ", "_", "-")).rstrip()
        safe_title = safe_title.replace(" ", "_").lower()
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"report_{safe_title}_{timestamp}.csv"
        file_path = os.path.join(reports_dir, filename)
        
        # Write to CSV
        keys = data[0].keys()
        with open(file_path, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=keys)
            writer.writeheader()
            writer.writerows(data)
            
        # Convert CSV to Markdown using MarkItDown
        md_filename = f"report_{safe_title}_{timestamp}.md"
        md_file_path = os.path.join(reports_dir, md_filename)
        try:
            from markitdown import MarkItDown
            md_converter = MarkItDown()
            conv_res = md_converter.convert(file_path)
            with open(md_file_path, "w", encoding="utf-8") as md_file:
                md_file.write(f"# Report: {title}\n\nGenerated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                md_file.write(conv_res.text_content)
            download_url = f"/static/reports/{md_filename}"
        except Exception:
            # Fallback to CSV if conversion fails
            download_url = f"/static/reports/{filename}"
        
        # Save to database
        db_report = Report(
            title=title,
            file_path=download_url,
            status="completed"
        )
        db.add(db_report)
        db.commit()
        db.refresh(db_report)
        
        return {
            "message": f"Report '{title}' generated successfully.",
            "report_id": db_report.id,
            "filename": filename,
            "download_url": download_url,
            "row_count": len(data),
            "created_at": db_report.created_at.strftime("%Y-%m-%d %H:%M:%S")
        }
        
    except Exception as e:
        db.rollback()
        return {"error": f"Failed to generate report: {str(e)}"}
