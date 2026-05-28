from pydantic import BaseModel, EmailStr
from typing import List, Dict, Any, Optional
import datetime

# --- Auth Schemas ---
class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


# --- Agent Schemas ---
class QueryRequest(BaseModel):
    query: str
    chat_history: Optional[List[Dict[str, str]]] = []

class QueryResponse(BaseModel):
    query: str
    sql_query: str
    query_result: Optional[List[Dict[str, Any]]] = None
    chart_config: Optional[Dict[str, Any]] = None
    anomalies: Optional[List[Dict[str, Any]]] = None
    report: Optional[Dict[str, Any]] = None
    dashboard: Optional[Dict[str, Any]] = None
    explanation: str
    errors: List[str]


# --- Dashboard Schemas ---
class DashboardCreate(BaseModel):
    name: str
    layout_config: Dict[str, Any]

class DashboardResponse(BaseModel):
    id: int
    name: str
    layout_config: Dict[str, Any]
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# --- Report Schemas ---
class ReportResponse(BaseModel):
    id: int
    title: str
    file_path: str
    status: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# --- Tool Execution Schemas ---
class ToolCallRequest(BaseModel):
    name: str
    arguments: Dict[str, Any]

class ToolCallResponse(BaseModel):
    status: str
    data: Optional[Any] = None
    message: Optional[str] = None
