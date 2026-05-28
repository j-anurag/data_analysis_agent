# data_analysis_agent - AI Data Analyst Agent

## Description
**data_analysis_agent** is a state-of-the-art enterprise AI Data Analyst agent. It enables business users to query databases and uploaded files using natural language, automatically generating optimized read-only SQL queries for database analysis.

This repository is organized as a monorepo containing a high-performance **FastAPI backend** (orchestrating the agent workflow using LangGraph and Groq LLM clients) and a modern **Next.js frontend portal** styled with custom Tailwind CSS.

---

## Key Features
- **Natural Language Playground**: Query databases and upload files using conversational English, with live visual tracking of agent execution steps.
- **Dynamic SQL Query Generation**: Formulates safe, optimized, read-only SELECT queries on-the-fly against your database schemas.
- **Seeded Demo Database**: Includes a built-in SQLite database containing demo enterprise schemas (`users`, `products`, `orders`, `web_events`) for immediate testing and quick start.
- **Interactive Visualizations**: Recharts integration configures and displays dynamic, responsive charts (Area, Bar, Line, Pie) dynamically.
- **Unsupervised Anomaly Detection**: Uses scikit-learn's Isolation Forest algorithm to detect data outliers, spikes, or drops automatically.
- **Smart Document Parsing (Microsoft MarkItDown)**: Converts uploaded files (PDF, DOCX, XLSX, XLS, CSV, TXT, HTML) into Markdown text using [Microsoft MarkItDown](https://github.com/microsoft/markitdown). This reduces token usage significantly by stripping layout overhead and provides clean text context directly in the agent reasoning loop.
- **Report & Dashboard Managers**: Save customized query views to dashboards or download generated datasets as CSV/Markdown files.

---

## Folder Structure
```
data_analyst_agent/           # Root directory
├─ backend/                   # FastAPI Backend
│  ├─ app/
│  │  ├─ agent/               # LangGraph Agent Core (workflow.py)
│  │  ├─ api/                 # Endpoint specs, schemas, and routes
│  │  ├─ db/                  # SQL database sessions and seed.py
│  │  ├─ models/              # SQLAlchemy model definitions
│  │  ├─ routers/             # FastAPI HTTP routes
│  │  ├─ tools/               # Agent tools (sql, anomaly, viz, dashboard, report)
│  │  ├─ main.py              # Server entry point
│  ├─ static/                 # Store exported reports
│  ├─ requirements.txt        # Backend dependencies
├─ frontend/                  # Next.js Frontend
│  ├─ app/                    # Next.js App Router (Workspace UI & layouts)
│  ├─ components/             # Reusable UI elements (Markdown, Auth)
│  ├─ styles/                 # Global styles and tailwind configs
│  ├─ package.json            # Frontend node packages
├─ docs/                      # Documentation assets
│  ├─ images/
│  │  ├─ architecture.png     # Architecture Diagram
├─ data_analysis_agent.db     # Seeded SQLite Demo Database
├─ Makefile                   # Automation commands for dependencies & running
├─ .env                       # Environment variables
└─ README.md                  # Project official documentation
```

---

## Setup & Configuration

### Prerequisites
Before running the application, ensure you have the following installed:
- Python 3.10+
- Node.js 18+ (npm)
- SQLite3

### Setup Environment Variables
Create a `.env` file in the root directory (already configured with a fallback in the codebase) containing the following details:

```env
GROQ_API_KEY=your_groq_api_key
MODEL_NAME=openai/gpt-oss-120b
TEMPERATURE=0.7
DATABASE_URL=sqlite:///./data_analysis_agent.db
```

---

## Usage (Running Locally)

To simplify the installation and launching of backend and frontend microservices, a `Makefile` is configured at the root of the project.

### Automation Commands

#### 1. Setup & Install Dependencies
Installs python packages, seeds database tables, and installs node modules:
```bash
make setup
```

#### 2. Run Backend API
Launches the FastAPI backend on port `8000`:
```bash
make backend
```

#### 3. Run Frontend App
Launches the Next.js frontend on port `3000`:
```bash
make frontend
```

#### 4. Run Monorepo (Parallel Servers)
Runs both frontend and backend concurrently in one terminal:
```bash
make run
```

---

## References
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Microsoft MarkItDown GitHub](https://github.com/microsoft/markitdown)
- [Recharts Visualizations](https://recharts.org/)
- [Isolation Forest Anomaly Algorithm](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html)
