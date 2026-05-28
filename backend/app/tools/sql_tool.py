import re
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.app.tools.registry import registry

@registry.register(
    name="get_db_schema",
    description="Retrieve the database schema including table names, columns, and types. Use this before writing SQL."
)
def get_db_schema(db: Session) -> str:
    """Returns the schema description of the SQLite database."""
    # SQLite system tables query
    query = text("""
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%';
    """)
    tables = db.execute(query).fetchall()
    
    schema_desc = []
    for table in tables:
        table_name = table[0]
        schema_desc.append(f"Table: {table_name}")
        
        # Get table info
        info_query = text(f"PRAGMA table_info({table_name});")
        columns = db.execute(info_query).fetchall()
        for col in columns:
            col_id, col_name, col_type, notnull, default_val, pk = col
            pk_desc = " (Primary Key)" if pk else ""
            schema_desc.append(f"  - {col_name} ({col_type}){pk_desc}")
            
    return "\n".join(schema_desc)


@registry.register(
    name="run_sql_query",
    description="Execute a read-only SQL query against the enterprise database and return the results."
)
def run_sql_query(query: str, db: Session) -> dict:
    """Executes a SQL query securely."""
    # Clean and check the query
    clean_query = query.strip()
    
    # Simple regex to block mutating operations
    forbidden = ["insert", "update", "delete", "drop", "alter", "create", "truncate", "replace", "grant"]
    for word in forbidden:
        pattern = rf"\b{word}\b"
        if re.search(pattern, clean_query, re.IGNORECASE):
            return {
                "error": f"Security violation: The query contains a forbidden keyword '{word}'."
            }
            
    # Also enforce starting with select / with / pragma table_info
    query_lower = clean_query.lower()
    is_select_or_with = query_lower.startswith("select") or query_lower.startswith("with")
    is_pragma_table_info = query_lower.startswith("pragma table_info")
    
    if not (is_select_or_with or is_pragma_table_info):
        return {
            "error": "Security violation: Only read-only queries (SELECT, WITH, or PRAGMA table_info statements) are permitted."
        }
        
    try:
        sql_stmt = text(clean_query)
        result = db.execute(sql_stmt)
        
        # Check if the query returned rows (e.g. SELECT)
        if result.returns_rows:
            columns = list(result.keys())
            rows = [dict(zip(columns, row)) for row in result.fetchall()]
            return {
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "sql": clean_query
            }
        else:
            return {
                "message": "Query executed successfully, but returned no rows.",
                "sql": clean_query
            }
    except Exception as e:
        return {
            "error": f"Database execution error: {str(e)}",
            "sql": clean_query
        }
