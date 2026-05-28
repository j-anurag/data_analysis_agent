from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.tools.registry import registry
from backend.app.api.schemas.schemas import ToolCallRequest, ToolCallResponse
from backend.app.api.routes.auth import get_current_user
from backend.app.models.models import User

# Make sure all tools are loaded and registered
from backend.app.tools import registry as global_registry

router = APIRouter(prefix="/tools", tags=["tools"])

@router.get("/list")
def list_available_tools(current_user: User = Depends(get_current_user)):
    """Lists all registered tools and their JSON schemas in MCP compliance format."""
    return registry.list_tools()

@router.post("/call", response_model=ToolCallResponse)
async def call_tool_mcp(
    payload: ToolCallRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Executes a registered tool by name with arguments (JSON-RPC MCP style)."""
    result = await registry.call_tool(payload.name, payload.arguments, db=db)
    
    if result["status"] == "success":
        return ToolCallResponse(status="success", data=result["data"])
    else:
        return ToolCallResponse(status="error", message=result["message"])

@router.post("/sql")
def execute_sql_manually(
    query: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Specific shortcut route to execute database query tool manually."""
    sql_tool_func = registry.tools.get("run_sql_query")
    if not sql_tool_func:
        raise HTTPException(status_code=500, detail="SQL query tool not registered.")
    
    func = sql_tool_func["func"]
    res = func(query=query, db=db)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res
