import os
import json
import logging
from typing import List, Dict, Any, TypedDict, Optional
from groq import Groq
from sqlalchemy.orm import Session

from backend.app.db.session import SessionLocal
from backend.app.tools.sql_tool import get_db_schema, run_sql_query
from backend.app.tools.anomaly_tool import detect_anomalies
from backend.app.tools.visualization_tool import configure_chart
from backend.app.tools.dashboard_tool import generate_dashboard
from backend.app.tools.report_tool import generate_report

logger = logging.getLogger("data_analysis_agent.agent")

# Initialize Groq client
api_key = os.getenv("GROQ_API_KEY")
model_name = os.getenv("MODEL_NAME", "openai/gpt-oss-120b")
temperature = float(os.getenv("TEMPERATURE", "0.7"))

client = Groq(api_key=api_key)

class AgentState(TypedDict):
    query: str
    messages: List[Dict[str, str]]
    schema: str
    sql_query: str
    query_result: Optional[List[Dict[str, Any]]]
    chart_config: Optional[Dict[str, Any]]
    anomalies: Optional[List[Dict[str, Any]]]
    report: Optional[Dict[str, Any]]
    dashboard: Optional[Dict[str, Any]]
    explanation: str
    errors: List[str]
    file_content: Optional[str]
    file_name: Optional[str]

class DataAnalysisAgent:
    def __init__(self):
        pass

    def _finalize_state(self, state: AgentState) -> Dict[str, Any]:
        """Applies fallback check to guarantee the explanation is never empty/whitespace-only."""
        if not state.get("explanation") or not state["explanation"].strip():
            if state.get("errors"):
                state["explanation"] = "I encountered an error while processing your request:\n" + "\n".join(f"- {err}" for err in state["errors"])
            elif state.get("file_content"):
                state["explanation"] = f"### File Analysis Summary\n\nI successfully processed the file **{state.get('file_name', 'Uploaded Document')}** using **Microsoft MarkItDown**. Here is a preview of the converted Markdown content:\n\n---\n{state.get('file_content')[:1500]}..."
            else:
                state["explanation"] = "I processed your request successfully, but the model generated an empty response. Please try rephrasing your question."
        return state

    def run(self, query: str, chat_history: List[Dict[str, str]] = None, db: Session = None, file_content: str = None, file_name: str = None) -> Dict[str, Any]:
        """Runs the complete data analysis workflow."""
        if chat_history is None:
            chat_history = []
            
        own_db = False
        if db is None:
            db = SessionLocal()
            own_db = True

        state: AgentState = {
            "query": query,
            "messages": chat_history.copy(),
            "schema": "",
            "sql_query": "",
            "query_result": None,
            "chart_config": None,
            "anomalies": None,
            "report": None,
            "dashboard": None,
            "explanation": "",
            "errors": [],
            "file_content": file_content,
            "file_name": file_name
        }

        try:
            # Step 1: Get DB schema
            logger.info("Step 1: Retrieving database schema...")
            state["schema"] = get_db_schema(db)

            # Step 2: Plan and Generate SQL
            logger.info("Step 2: Planning and generating SQL query...")
            self._generate_sql(state)
            
            if state["sql_query"] == "CONVERSATIONAL":
                logger.info("Detected conversational query. Returning directly...")
                state["sql_query"] = "" # Clear so it does not show the Inspect SQL toggles
                return self._finalize_state(state)

            if state["sql_query"] == "METADATA_QUERY":
                # Handle database metadata or feature explanatory queries directly
                logger.info("Detected database schema, datasource, or feature metadata query. Synthesizing metadata response...")
                state["sql_query"] = "" # Clear so it does not show the Inspect SQL toggles
                self._synthesize_metadata_response(state)
                return self._finalize_state(state)

            if state["sql_query"] == "FILE_QUERY":
                # Handle questions on uploaded files
                logger.info("Detected query about the uploaded file. Synthesizing file response...")
                state["sql_query"] = "" # Clear so it does not show the Inspect SQL toggles
                self._synthesize_file_response(state)
                return self._finalize_state(state)


            if state["errors"]:
                # If SQL generation failed, formulate failure explanation
                self._synthesize_error_response(state)
                return self._finalize_state(state)

            # Step 3: Run SQL
            logger.info(f"Step 3: Running SQL query: {state['sql_query']}")
            db_res = run_sql_query(state["sql_query"], db)
            
            if "error" in db_res:
                state["errors"].append(db_res["error"])
                self._synthesize_error_response(state)
                return self._finalize_state(state)
                
            state["query_result"] = db_res.get("rows", [])
            
            # Step 4: Perform Analytics & Visualization
            if state["query_result"]:
                logger.info("Step 4: Executing analytics, visualization, and reporting tools...")
                self._run_analytics_and_viz(state, db)
            else:
                state["errors"].append("SQL query returned 0 rows.")

            # Step 5: Synthesize Final Explanation
            logger.info("Step 5: Synthesizing final response...")
            self._synthesize_response(state)

        except Exception as e:
            logger.error(f"Agent workflow error: {str(e)}")
            state["errors"].append(f"Internal workflow error: {str(e)}")
            state["explanation"] = f"I'm sorry, I encountered an internal error while processing your request: {str(e)}"
        finally:
            if own_db:
                db.close()

        return self._finalize_state(state)

    def _generate_sql(self, state: AgentState):
        """Asks the LLM to write a SQL query based on user intent and DB schema."""
        file_info = ""
        file_rule = ""
        is_dataset = False
        table_name = ""
        if state.get("file_name"):
            ext = os.path.splitext(state["file_name"])[1].lower()
            if ext in [".csv", ".xlsx", ".xls"]:
                is_dataset = True
                import re
                raw_basename = os.path.splitext(state["file_name"])[0]
                sanitized_name = re.sub(r'[^a-zA-Z0-9_]', '_', raw_basename).strip('_').lower()
                table_name = f"uploaded_{sanitized_name}"

        if state.get("file_content"):
            if is_dataset:
                file_info = f"\nUploaded Dataset File: {state['file_name']}\nThis dataset was loaded into the SQLite database as table: `{table_name}`\nPreview of file data:\n---\n{state['file_content'][:5000]}\n---\n"
                file_rule = (
                    f"10. The uploaded dataset has been successfully loaded into the database as a SQL table name: `{table_name}`. "
                    f"Find the corresponding table `{table_name}` in the Database Schema above.\n"
                    f"11. You MUST write a SQL SELECT query against this `{table_name}` table to fetch data. Do NOT output 'FILE_QUERY' or 'METADATA_QUERY' under any circumstances for this dataset.\n"
                    f"12. If the user query is general (e.g., 'Analyze the uploaded file...', 'Analyse this', or empty prompt), write a SQL query to select all relevant data (e.g., SELECT * FROM `{table_name}` LIMIT 100) so we can analyze and visualize it. "
                    f"Ensure that the SQL query is valid SQLite and matches the columns of table `{table_name}`."
                )
            else:
                file_info = f"\nUploaded File Content (Markdown converted):\n---\n{state['file_content'][:20000]}\n---\n"
                file_rule = "10. If the user query is about the uploaded file, its contents, or asks to analyze/summarize/interpret the file, output the exact text 'FILE_QUERY: <reasoning>'. Do NOT write a SQL query."

        system_prompt = f"""You are an expert SQL engineer. Given a database schema and a user query, write a single SQL SELECT query that fetches the necessary data to answer the query.
        
Database Schema:
{state["schema"]}
{file_info}

Rules:
1. ONLY return the raw SQL query. Do NOT wrap it in markdown code blocks (e.g. ```sql), do NOT write explanation, do NOT add comments.
2. Use aggregations, counts, sums, groupings, and orderings where appropriate.
3. Keep queries read-only.
4. Limit the query results to 500 rows maximum.
5. If the request is a conversational greeting (e.g. "hey", "hello", "hi", "how are you", "who are you"), output the exact text 'CONVERSATIONAL: <friendly analyst greeting asking them what data they would like to explore>'.
6. Keep the SQL query simple and focused on returning raw or grouped rows. Do NOT attempt to calculate statistical anomalies, standard deviation, or z-scores inside the SQL query itself; the agent runs a dedicated python analytics engine (`detect_anomalies`) to automatically identify anomalies on the query results.
7. Only query columns that exist in the schema. Do not use functions like STDDEV or STDDEV_POP that are not supported by SQLite.
8. If the user query is about the database tables, database schema, columns, datasources, or databases themselves, OR about how system features work (e.g., how dashboards are created, saved, or loaded, how anomalies are detected, how reports are exported, how the agent works), output the exact text 'METADATA_QUERY: <description of user request>'. Do NOT attempt to write a SQL statement for these.
9. If the request cannot be answered by the schema (and is not conversational or metadata-related) AND is not about the uploaded file, output the text 'ERROR: Cannot answer request with current schema'.
{file_rule}
"""

        try:
            messages = [
                {"role": "system", "content": system_prompt}
            ]
            # Add recent chat history for context
            for msg in state["messages"][-4:]:
                messages.append(msg)
                
            messages.append({"role": "user", "content": state["query"]})

            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.1, # low temperature for exact code generation
                max_tokens=500
            )
            
            content = response.choices[0].message.content
            sql = content.strip() if content else ""
            
            # Clean up potential markdown formatting if LLM disobeyed rules
            if sql.startswith("```"):
                sql = sql.replace("```sql", "").replace("```", "").strip()
                
            # Classify responses
            sql_lower = sql.lower()
            
            # If a file is uploaded, let's see if we should override conversational/other classifications
            is_greeting = False
            if state.get("file_content"):
                greeting_words = {"hi", "hello", "hey", "hola", "greetings", "howdy", "how are you", "who are you"}
                query_words = set(state["query"].lower().strip("?.!").split())
                if query_words.intersection(greeting_words):
                    is_greeting = True

            if sql.startswith("CONVERSATIONAL:") and not (state.get("file_content") and not is_greeting):
                state["sql_query"] = "CONVERSATIONAL"
                state["explanation"] = sql[len("CONVERSATIONAL:"):].strip()
            elif sql.startswith("METADATA_QUERY:"):
                state["sql_query"] = "METADATA_QUERY"
            elif sql.startswith("FILE_QUERY:"):
                if is_dataset:
                    state["sql_query"] = f"SELECT * FROM `{table_name}` LIMIT 100"
                else:
                    state["sql_query"] = "FILE_QUERY"
            elif state.get("file_content") and not is_dataset and not (sql_lower.startswith("select") or sql_lower.startswith("with") or sql_lower.startswith("pragma")):
                # Programmatic fallback: if a file is uploaded, and the response is not valid SQL, route to file analysis
                state["sql_query"] = "FILE_QUERY"
            elif is_dataset and not (sql_lower.startswith("select") or sql_lower.startswith("with") or sql_lower.startswith("pragma")):
                state["sql_query"] = f"SELECT * FROM `{table_name}` LIMIT 100"
            elif "ERROR" in sql or "cannot answer" in sql_lower:
                if is_dataset:
                    state["sql_query"] = f"SELECT * FROM `{table_name}` LIMIT 100"
                else:
                    state["errors"].append("The data analyst could not map your query to the available database schema.")
            elif not (sql_lower.startswith("select") or sql_lower.startswith("with") or sql_lower.startswith("pragma")):
                if is_dataset:
                    state["sql_query"] = f"SELECT * FROM `{table_name}` LIMIT 100"
                else:
                    secure_fallback = "CONVERSATIONAL"
                    state["sql_query"] = secure_fallback
                    state["explanation"] = sql
            else:
                state["sql_query"] = sql
                
        except Exception as e:
            logger.error(f"SQL generation failed: {e}")
            state["errors"].append(f"SQL generation failed: {str(e)}")

    def _run_analytics_and_viz(self, state: AgentState, db: Session):
        """Determines which analytical tools should be called based on user query."""
        query_lower = state["query"].lower()
        data = state["query_result"]
        
        # 1. Always generate a chart config so the frontend can visualize the data
        try:
            chart_res = configure_chart(data, title=f"Visualizing: {state['query']}")
            if "error" not in chart_res:
                state["chart_config"] = chart_res
                # Generate a short AI summary for the chart
                self._generate_chart_summary(state)
        except Exception as e:
            logger.warning(f"Chart configuration failed: {e}")

        # 2. Check if anomaly detection is requested or relevant
        is_timeseries = any(any(x in key.lower() for x in ["date", "time", "day", "month", "year"]) for key in data[0].keys())
        wants_anomaly = any(w in query_lower for w in ["anomaly", "anomalies", "outlier", "outliers", "spike", "drop", "unusual", "deviation"])
        
        if (wants_anomaly or is_timeseries) and len(data) >= 5:
            # Find the best numeric key to analyze
            numeric_keys = []
            for k, v in data[0].items():
                k_lower = k.lower()
                if any(x in k_lower for x in ["date", "time", "day", "month", "year", "id", "email"]):
                    continue
                if isinstance(v, bool):
                    continue
                try:
                    float(v)
                    numeric_keys.append(k)
                except (ValueError, TypeError):
                    pass
            if numeric_keys:
                value_key = numeric_keys[0] # Analyze the first numeric metric
                try:
                    logger.info(f"Detected numeric keys for anomaly analysis: {numeric_keys}. Analyzing: {value_key}")
                    anomaly_res = detect_anomalies(data, value_key=value_key)
                    logger.info(f"Anomaly detection returned: {anomaly_res}")
                    if "error" not in anomaly_res:
                        state["anomalies"] = anomaly_res.get("anomalies", [])
                    else:
                        logger.warning(f"Anomaly detection returned error: {anomaly_res['error']}")
                except Exception as e:
                    logger.warning(f"Anomaly detection failed: {e}")

        # 3. Check if user wants to download/export report
        wants_report = any(w in query_lower for w in ["report", "export", "csv", "download"])
        if wants_report:
            try:
                report_res = generate_report(title=state["query"], data=data, db=db)
                if "error" not in report_res:
                    state["report"] = report_res
            except Exception as e:
                logger.warning(f"Report generation failed: {e}")

        # 4. Check if user wants to save/generate a dashboard
        wants_dashboard = any(w in query_lower for w in ["dashboard", "save view"])
        if wants_dashboard:
            try:
                # Compose basic cards
                kpi_cards = []
                numeric_keys = []
                for k, v in data[0].items():
                    k_lower = k.lower()
                    if any(x in k_lower for x in ["date", "time", "day", "month", "year", "id", "email"]):
                        continue
                    if isinstance(v, bool):
                        continue
                    try:
                        float(v)
                        numeric_keys.append(k)
                    except (ValueError, TypeError):
                        pass
                for key in numeric_keys[:3]:
                    total_val = sum(float(row[key]) for row in data if row[key] is not None)
                    kpi_cards.append({
                        "title": f"Total {key.replace('_', ' ').title()}",
                        "value": f"{total_val:,.2f}" if "revenue" in key or "profit" in key or "cost" in key else f"{int(total_val):,}",
                        "change": "+4.2%" # hardcoded mock trend indicator
                    })
                
                layout_config = {
                    "cards": kpi_cards,
                    "charts": [state["chart_config"]] if state["chart_config"] else []
                }
                
                dash_res = generate_dashboard(name=f"Dashboard: {state['query'][:30]}", layout_config=layout_config, db=db)
                if "error" not in dash_res:
                    state["dashboard"] = dash_res
            except Exception as e:
                logger.warning(f"Dashboard creation failed: {e}")

    def _synthesize_response(self, state: AgentState):
        """Asks the LLM to write a premium final summary explanation using data results."""
        # Truncate results for context window efficiency
        sample_size = min(15, len(state["query_result"]))
        sample_data = state["query_result"][:sample_size]
        
        anomalies_summary = ""
        if state["anomalies"]:
            anomalies_summary = json.dumps(state["anomalies"], indent=2)
        else:
            anomalies_summary = "No anomalies detected."
 
        system_prompt = """You are data_analysis_agent, a state-of-the-art enterprise AI Data Analyst.
Your goal is to explain database query results, trends, and anomalies to business stakeholders.
 
Rules:
1. Provide a professional, extremely concise, and data-driven summary.
2. Structure your answer using markdown. Use bullet points and bold text for metrics.
3. Explicitly comment on trends (e.g. rising/falling) and date ranges.
4. Highlight anomalies! If anomalies are present, describe exactly when they happened, the metric value, and what it implies.
5. If the user asked to generate a report, dashboard, or chart, mention that it was created and is displayed on the screen.
6. Speak directly, avoid generic pleasantries, and focus on data-driven observations.
7. Be extremely concise. Focus strictly on data insights and observations to save tokens. Avoid verbose introductions or summary paragraphs.
8. Conclude with 3-4 specific and actionable follow-up analysis suggestions as a bulleted list. Each suggestion must begin with an actionable verb (like 'Show', 'What', 'Calculate', 'Compare', 'Find', 'Which', 'Plot') or end with a question mark, so they are rendered as clickable suggestions in the UI. Keep them focused on the database table(s) queried.
"""
 
        user_content = f"""User Query: {state["query"]}
SQL Query Executed: {state["sql_query"]}
Number of rows returned: {len(state["query_result"])}
Data Sample (up to 15 rows): {json.dumps(sample_data, default=str)}
Anomalies found: {anomalies_summary}
Has Chart Config: {state["chart_config"] is not None}
Has Report Generated: {state["report"] is not None}
Has Dashboard Saved: {state["dashboard"] is not None}
 
Write the analytics explanation:"""
 
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=temperature,
                max_tokens=600
            )
            content = response.choices[0].message.content
            state["explanation"] = content.strip() if content else ""
        except Exception as e:
            logger.error(f"Explanation synthesis failed: {e}")
            state["explanation"] = f"Here is the query result ({len(state['query_result'])} rows). SQL executed: `{state['sql_query']}`."

    def _synthesize_error_response(self, state: AgentState):
        """Asks the LLM to write a helpful guidance message when a query is off-track or fails."""
        errors_text = "; ".join(state["errors"]) if state["errors"] else "Query does not match standard database fields."
        
        system_prompt = """You are data_analysis_agent, a state-of-the-art enterprise AI Data Analyst.
The user asked a query that could not be mapped to a valid database SQL query, was off-topic, conversational, or resulted in an error.
Your goal is to guide the user back on track.

Rules:
1. Be helpful, professional, and conversational.
2. Briefly explain why the query couldn't be answered (e.g. if it is off-topic or doesn't match the database schema).
3. Remind the user what data is available in the system:
   - Orders & Sales (revenue, profit, quantities, dates)
   - Products (names, categories, price, cost, stock)
   - Web Events & Logs (page views, response times, paths, status codes)
   - Users (usernames, roles, sign-up dates)
4. Offer 3-4 highly specific, relevant follow-up data analysis suggestions as bullet points, based on their input pattern or the schema.
5. Do NOT output raw SQL queries in the suggestions, just the natural language questions. Keep suggestions simple and direct.
"""
        user_content = f"""User Query: {state["query"]}
Errors encountered: {errors_text}
Available tables:
- users: User profiles, roles, and sign-up dates.
- products: Product catalog, category, price, cost, and stock.
- orders: Customer transactions, quantities, revenue, cost, profit, and order dates.
- web_events: Traffic logs, page views, api calls, response times, paths, and status codes.

Write the guidance response:"""

        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=temperature,
                max_tokens=600
            )
            content = response.choices[0].message.content
            state["explanation"] = content.strip() if content else ""
        except Exception as e:
            logger.error(f"Error explanation synthesis failed: {e}")
            state["explanation"] = f"### Analytics Request Failed\n\nI encountered errors while trying to query and analyze the database:\n- **Error Details**: {errors_text}\n\nPlease try rephrasing your request or selecting a different metric."

    def _synthesize_metadata_response(self, state: AgentState):
        """Synthesizes a response for questions about database tables, schemas, or system features."""
        system_prompt = f"""You are data_analysis_agent, a state-of-the-art enterprise AI Data Analyst.
The user is asking a question about the databases, database schema, tables, columns, datasources, or how features work (like saving dashboards or exporting reports).
Your goal is to answer their question comprehensively and professionally.

Database Schema and Tables:
{state["schema"]}

Information about how dashboards are created:
- Dashboards are composed of visual metrics cards (KPIs) and charts.
- They are created dynamically by the agent when you run a query and ask to "generate a dashboard" or "save this view" (e.g., "Compare monthly sales by category and save this dashboard").
- The agent calls the `generate_dashboard` tool which saves the layout config in the SQL database.
- Saved dashboards are persistent and can be viewed or loaded from the "Dashboards" tab in the left sidebar.

Rules:
1. Write a clean, structured explanation answering the user's question. Use Markdown headings, bullet points, and tables where helpful.
2. Direct the user clearly. Speak in first-person as the assistant.
3. Suggest 3 follow-up data analysis queries at the end as bullet points. Do NOT output raw SQL queries in the suggestions, just the natural language questions. Keep suggestions simple and direct.
"""
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": state["query"]}
                ],
                temperature=temperature,
                max_tokens=800
            )
            content = response.choices[0].message.content
            state["explanation"] = content.strip() if content else ""
        except Exception as e:
            logger.error(f"Metadata response synthesis failed: {e}")
            state["explanation"] = "I could not retrieve the metadata details at this time. Here are the tables available in the database:\n" + state["schema"]

    def _generate_chart_summary(self, state: AgentState):
        """Generates a 2-sentence AI summary of the chart data, focusing on business impact and data mapping."""
        if not state["chart_config"] or not state["query_result"]:
            return

        sample_data = state["query_result"][:10]
        system_prompt = """You are a senior data analyst. Write a very short (2 sentences maximum), high-impact AI summary explaining the chart results.
Format:
- Sentence 1: Summarize the key trend, spike, or takeaway (e.g., 'Revenue peaked in December at $288K, driven by holiday sales').
- Sentence 2: Explain the impact or mapping (e.g., 'The blue area chart indicates strong seasonal stability across all categories').
Keep it extremely concise, clear, and business-focused to save tokens. No pleasantries.
"""
        user_content = f"Query: {state['query']}\nChart Type: {state['chart_config'].get('chart_type')}\nSample Data: {json.dumps(sample_data, default=str)}"

        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.3,
                max_tokens=150
            )
            content = response.choices[0].message.content
            state["chart_config"]["summary"] = content.strip() if content else "Visualization of the queried metrics showing trend patterns."
        except Exception as e:
            logger.warning(f"Failed to generate chart summary: {e}")
            state["chart_config"]["summary"] = "Visualization of the queried metrics showing trend patterns."

    def _synthesize_file_response(self, state: AgentState):
        """Asks the LLM to analyze the uploaded file content and answer the user query."""
        system_prompt = """You are data_analysis_agent, a state-of-the-art enterprise AI Data Analyst.
Your goal is to perform a deep, highly detailed, and comprehensive analysis of the uploaded file.

Rules:
1. Provide a professional, thorough, and highly detailed data-driven analysis based on the provided file content.
2. Structure your response using markdown. Use clear subheadings, bullet points, bold text for metrics, and markdown tables where appropriate.
3. Deep-dive into the dataset: analyze distributions, calculate key statistics or summary metrics, identify potential trends or anomalies, and explain their business implications.
4. Clearly analyze the columns/data structure and recommend what charts can be constructed from this dataset (e.g. bar chart, line chart, area chart, pie chart) and describe the exact metrics or columns mapped.
5. Conclude with 3-4 specific and actionable follow-up analysis or visualization questions. Make sure these suggestions are in a bulleted list starting with actionable verbs (like "Show", "Are", "What", "Which", "Plot", "Can", "Identify") so the user can click them to run automatically!
6. Speak directly and focus on deep analytical insights. Avoid brief summaries or generic pleasantries.
"""
        user_content = f"""User Query: {state["query"]}
Uploaded File Name: {state.get("file_name", "Uploaded File")}
File Content (Markdown):
---
{state.get("file_content", "")}
---

Write the analysis and response:"""

        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=temperature,
                max_tokens=800
            )
            content = response.choices[0].message.content
            state["explanation"] = content.strip() if content else ""
        except Exception as e:
            logger.error(f"File query synthesis failed: {e}")
            state["explanation"] = f"I failed to analyze the file content: {str(e)}"
