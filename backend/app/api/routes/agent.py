from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException
from sqlalchemy.orm import Session
import json
import os
import tempfile
from markitdown import MarkItDown
from backend.app.db.session import get_db
from backend.app.api.schemas.schemas import QueryRequest, QueryResponse
from backend.app.agent.workflow import DataAnalysisAgent
from backend.app.api.routes.auth import get_current_user
from backend.app.models.models import User

router = APIRouter(prefix="/agent", tags=["agent"])

@router.post("/query", response_model=QueryResponse)
def run_agent_query(
    payload: QueryRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submits a natural language query to the AI Data Analyst Agent.
    The agent dynamically generates SQL, runs it, checks for anomalies, 
    configures visualization, and synthesizes a textual explanation.
    """
    agent = DataAnalysisAgent()
    agent_result = agent.run(
        query=payload.query, 
        chat_history=payload.chat_history, 
        db=db
    )
    return agent_result

@router.post("/query-file", response_model=QueryResponse)
async def run_agent_file_query(
    file: UploadFile = File(...),
    query: str = Form(""),
    chat_history: str = Form("[]"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submits a natural language query alongside an uploaded file.
    The file is converted to Markdown using MarkItDown and passed to the agent as context.
    """
    try:
        chat_history_list = json.loads(chat_history)
    except Exception:
        chat_history_list = []

    # Save uploaded file to a temporary file
    temp_dir = tempfile.gettempdir()
    _, ext = os.path.splitext(file.filename)
    temp_file_path = os.path.join(temp_dir, f"upload_{os.urandom(8).hex()}{ext}")

    try:
        with open(temp_file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Convert to markdown using MarkItDown
        try:
            md_converter = MarkItDown()
            result = md_converter.convert(temp_file_path)
            markdown_content = result.text_content
        except Exception as conv_err:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to convert file to Markdown: {str(conv_err)}"
            )

        # Parse CSV or Excel files and load into SQLite database as a queryable table
        if ext.lower() in [".csv", ".xlsx", ".xls"]:
            try:
                import re
                import pandas as pd
                import sqlite3
                
                if ext.lower() == ".csv":
                    df = pd.read_csv(temp_file_path)
                else:
                    df = pd.read_excel(temp_file_path)
                
                # Clean column names to be alphanumeric and underscores only
                clean_cols = {col: re.sub(r'[^a-zA-Z0-9_]', '_', str(col)).strip('_').lower() for col in df.columns}
                df = df.rename(columns=clean_cols)
                
                # Generate a sanitized table name matching the filename
                raw_basename = os.path.splitext(file.filename)[0]
                sanitized_name = re.sub(r'[^a-zA-Z0-9_]', '_', raw_basename).strip('_').lower()
                table_name = f"uploaded_{sanitized_name}"
                
                # Save to database using connection path derived from DATABASE_URL
                from backend.app.db.session import DATABASE_URL
                db_path = DATABASE_URL
                if db_path.startswith("sqlite:///"):
                    db_path = db_path[len("sqlite:///"):].strip()
                
                conn = sqlite3.connect(db_path)
                df.to_sql(table_name, con=conn, if_exists="replace", index=False)
                conn.close()
            except Exception as write_err:
                # Log the warning but don't fail hard, fallback to standard markdown parsing
                print(f"Warning: Failed to load file to SQLite: {write_err}")

    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

    # Process using the agent
    agent = DataAnalysisAgent()
    agent_result = agent.run(
        query=query if query.strip() else f"Analyze the uploaded file {file.filename}",
        chat_history=chat_history_list,
        db=db,
        file_content=markdown_content,
        file_name=file.filename
    )
    return agent_result

