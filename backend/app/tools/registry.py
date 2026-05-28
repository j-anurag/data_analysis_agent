import inspect
import logging
from typing import Callable, Dict, Any, List

logger = logging.getLogger("data_analysis_agent.tools")

class ToolRegistry:
    def __init__(self):
        self.tools: Dict[str, Dict[str, Any]] = {}

    def register(self, name: str, description: str):
        """Decorator to register a tool function."""
        def decorator(func: Callable):
            sig = inspect.signature(func)
            parameters = {}
            for param_name, param in sig.parameters.items():
                if param_name == "db":  # DB session injected dynamically
                    continue
                
                # Deduce JSON schema type
                param_type = "string"
                if param.annotation == int:
                    param_type = "integer"
                elif param.annotation == float:
                    param_type = "number"
                elif param.annotation == bool:
                    param_type = "boolean"
                elif param.annotation == dict:
                    param_type = "object"
                elif param.annotation == list:
                    param_type = "array"
                
                # Check for description in docstrings or use standard
                parameters[param_name] = {
                    "type": param_type,
                    "description": f"The {param_name} argument."
                }
            
            # Simple parameter parsing
            self.tools[name] = {
                "name": name,
                "description": description,
                "func": func,
                "parameters": {
                    "type": "object",
                    "properties": parameters,
                    "required": [
                        k for k, v in sig.parameters.items() 
                        if v.default == inspect.Parameter.empty and k != "db"
                    ]
                }
            }
            return func
        return decorator

    def list_tools(self) -> List[Dict[str, Any]]:
        """List all tools in standard MCP schema format."""
        return [
            {
                "name": t["name"],
                "description": t["description"],
                "inputSchema": t["parameters"]
            }
            for t in self.tools.values()
        ]

    async def call_tool(self, name: str, arguments: Dict[str, Any], db: Any = None) -> Dict[str, Any]:
        """Execute a tool with parameters, injecting db if needed."""
        if name not in self.tools:
            raise ValueError(f"Tool '{name}' is not registered.")
        
        tool_info = self.tools[name]
        func = tool_info["func"]
        
        # Prepare arguments
        sig = inspect.signature(func)
        kwargs = {}
        for param_name in sig.parameters.keys():
            if param_name == "db":
                kwargs["db"] = db
            elif param_name in arguments:
                kwargs[param_name] = arguments[param_name]
        
        try:
            logger.info(f"Executing tool {name} with arguments {arguments}")
            if inspect.iscoroutinefunction(func):
                result = await func(**kwargs)
            else:
                result = func(**kwargs)
            return {"status": "success", "data": result}
        except Exception as e:
            logger.error(f"Error executing tool {name}: {str(e)}")
            return {"status": "error", "message": str(e)}

registry = ToolRegistry()
