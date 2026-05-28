# InsightFlow AI - AI Data Analyst Agent

## Description
**InsightFlow AI** is a state-of-the-art enterprise AI Data Analyst agent. It enables business users to query databases and uploaded files using natural language, automatically generating optimized read-only SQL queries for database analysis, or using **Microsoft MarkItDown** to convert uploaded documents (PDF, DOCX, XLSX, XLS, CSV, TXT, HTML) to Markdown text for direct LLM reasoning and analytics. It also performs unsupervised anomaly detection using an Isolation Forest ML model, generates interactive Recharts visualizations, dashboard layouts, and exports reports directly to Markdown (.md) files.

This repository is organized as a monorepo containing a high-performance **FastAPI backend** (orchestrating the agent workflow using LangGraph and Groq LLM clients) and a modern **Next.js frontend portal** styled with custom Tailwind CSS.

---

## Architecture
The system architecture of InsightFlow AI follows a clean 4-tier model designed for security, analytics throughput, and real-time response:

![InsightFlow AI System Architecture](docs/images/architecture.png)

### Core Components
1. **Client Tier (Channels)**:
   - **Business Analyst Desktop**: The primary user interface for natural language playground and visualization.
   - **Data Scientist / API Client**: Fast access via programmatic HTTP endpoints.
   - **Executive Viewer (Mobile)**: Mobile-responsive browser views of saved dashboards and PDF reports.
2. **Frontend Portal (Next.js)**:
   - **AI Chat Playground**: Features live agent execution step tracking, interactive visual rendering, and SQL query inspection.
   - **Interactive Dashboard (Recharts)**: Renders dynamic charts (Area, Bar, Line, Pie) based on JSON configs compiled by the agent.
   - **Report & Dashboard Managers**: Persistent displays stored in SQLite.
3. **Processing Engine (Middleware / FastAPI & LangGraph)**:
   - **FastAPI API Gateway**: Secure endpoints for authentication, query submission, and static report downloads.
   - **LangGraph Agent Engine**: Executes a 5-step analysis pipeline:
     1. **Schema Retrieval**: Grabs active SQLite schema metadata.
     2. **SQL Generation**: Leverages Groq-hosted LLMs to construct secure SELECT queries.
     3. **Execution**: Safely queries the local SQLite engine.
     4. **Analytics Pipeline**: Triggers Isolation Forest for anomaly/outlier detection and configures Recharts specs.
     5. **Response Synthesis**: Formulates concise, business-oriented summaries.
   - **Analytical Engines**: Standardizes mathematical configs and runs `scikit-learn` algorithms on query tables.
4. **Data Store (Back End Resources)**:
   - **SQLite (`insightflow.db`)**: Self-contained database containing corporate schemas (`users`, `products`, `orders`, `web_events`) and framework tables (`dashboards`, `reports`).
   - **Local File Storage**: Repository for compiled static PDF, HTML, and CSV export artifacts.

---

## Folder Structure
Here is the file layout of the InsightFlow monorepo:

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
├─ insightflow.db             # Local SQLite Database
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
DATABASE_URL=sqlite:///./insightflow.db
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

## Database Schema Design
The SQLite database (`insightflow.db`) contains the following transactional schemas used for analytics:

### Users Table (`users`)
Stores profile information and authentication credentials.
* `id` (INTEGER, Primary Key): Unique identifier
* `username` (VARCHAR, Unique): Login name
* `email` (VARCHAR, Unique): User email address
* `role` (VARCHAR): Defaults to `analyst` (options: `admin`, `analyst`, `viewer`)
* `created_at` (DATETIME): Timestamp of registration

### Products Table (`products`)
Stores the catalog of goods.
* `id` (INTEGER, Primary Key): Product identifier
* `name` (VARCHAR): Product name
* `category` (VARCHAR): Category classification for grouping
* `price` (FLOAT): Retail price
* `cost` (FLOAT): Product unit cost
* `stock` (INTEGER): Available inventory quantity

### Orders Table (`orders`)
Captures transactions and generates revenue ledger.
* `id` (INTEGER, Primary Key): Transaction identifier
* `user_id` (INTEGER, Foreign Key): Maps to `users.id`
* `product_id` (INTEGER, Foreign Key): Maps to `products.id`
* `quantity` (INTEGER): Items ordered
* `revenue` (FLOAT): Gross sales (`price * quantity`)
* `cost` (FLOAT): Total cost of goods sold (`cost * quantity`)
* `profit` (FLOAT): Net margin (`revenue - cost`)
* `order_date` (DATETIME): Timestamp of order placement

### Web Events Table (`web_events`)
Stores logging metrics for tracking system load and errors.
* `id` (INTEGER, Primary Key): Event identifier
* `event_date` (DATETIME): Log timestamp
* `event_type` (VARCHAR): Classification (`page_view`, `signup`, `login`, `api_call`)
* `status_code` (INTEGER): HTTP status code response (e.g., 200, 404, 500)
* `response_time` (FLOAT): Server execution time in milliseconds
* `path` (VARCHAR): Endpoint or page route requested

---

## Agent Pipeline & Analytics Tools
InsightFlow AI uses modular, python-based analytical tools invoked by the LangGraph workflow:

### 1. SQL Tool (`sql_tool.py`)
Introspects tables, formats SQLite schemas for LLM context, and executes read-only SQL SELECT queries safely, returning result rows as list dicts.

### 2. Visualization Tool (`visualization_tool.py`)
Inspects query results, identifies keys, and automatically constructs Recharts configuration structures (chart type, X/Y axis data, key dimensions, and responsive wrapper tags) alongside an AI-synthesized chart caption.

### 3. Anomaly Detection (`anomaly_tool.py`)
Uses `scikit-learn`'s **Isolation Forest** unsupervised algorithm to calculate outliers on time-series/numeric queries automatically. If the user asks about "spikes", "drops", or if time-series data is query-matched, the engine marks outlying logs with an `is_anomaly=True` flag and calculates upper/lower confidence bounds.

### 4. Dashboard Generator (`dashboard_tool.py`)
Takes layout configurations and saves dashboard widget states to SQLite, making them persistent and loadable in the Next.js sidebar.

### 5. Report Generator (`report_tool.py`)
Saves query results as static files (CSV format) and automatically converts them to clean Markdown (`.md`) format using **Microsoft MarkItDown** to allow users to download formatted documents.

### 6. Document Parsing Engine (Microsoft MarkItDown)
Integrates Microsoft's `markitdown` tool in the file upload ingestion route. Any uploaded PDF, DOCX, XLSX, CSV, or HTML file is immediately converted to standard Markdown to strip layout overhead, optimize LLM tokens usage, and provide text context directly in the agent reasoning loop.

---

## Deployment Playbook (Production Setup)
To help you deploy this application into production, follow this playbook:

### Architecture Options

#### Option A: Containerized Deployment (Docker Compose) - *Recommended*
Deploy backend and frontend services inside isolated Docker containers on a single VM (AWS EC2, GCP Compute, DigitalOcean Droplet).

#### Option B: Decoupled SaaS (FastAPI on Render and Frontend on Vercel)
- Deploy FastAPI on Render (Web Service) connected to a persistent PostgreSQL instance.
- Deploy the Next.js app on Vercel.

---

### Step-by-Step Deployment Instructions

#### 1. Database Migration (PostgreSQL)
In production, replace SQLite with PostgreSQL for concurrent writing.
1. Update `DATABASE_URL` in your environment variables:
   ```env
   DATABASE_URL=postgresql://user:password@host:port/dbname
   ```
2. SQLAlchemy will automatically connect using Postgres dialects. Ensure you install `psycopg2-binary` in your backend requirements:
   ```bash
   pip install psycopg2-binary>=2.9.0
   ```

#### 2. Production Docker Configurations

##### Backend Dockerfile (`backend/Dockerfile`)
```dockerfile
FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

##### Frontend Dockerfile (`frontend/Dockerfile`)
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
```

##### Docker Compose Configuration (`docker-compose.yml`)
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: insightflow-db
    environment:
      POSTGRES_USER: insightflow_user
      POSTGRES_PASSWORD: securepassword123
      POSTGRES_DB: insightflow_prod
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: always

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: insightflow-backend
    environment:
      - DATABASE_URL=postgresql://insightflow_user:securepassword123@postgres:5432/insightflow_prod
      - GROQ_API_KEY=${GROQ_API_KEY}
      - MODEL_NAME=${MODEL_NAME}
      - TEMPERATURE=${TEMPERATURE}
    ports:
      - "8000:8000"
    depends_on:
      - postgres
    restart: always

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: insightflow-frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:8000/api/v1
    depends_on:
      - backend
    restart: always

volumes:
  pgdata:
```

#### 3. Reverse Proxy & HTTPS (Nginx)
Configure Nginx as a reverse proxy in front of Docker Compose to handle SSL termination:

```nginx
server {
    listen 80;
    server_name analyst.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name analyst.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/analyst.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/analyst.yourdomain.com/privkey.pem;

    # Frontend Routing
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API Routing
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static reports routing
    location /static {
        proxy_pass http://localhost:8000/static;
        proxy_set_header Host $host;
    }
}
```

#### 4. Environment Variables Checklist
Make sure the cloud environment (AWS, Render, etc.) has the following set:
- `GROQ_API_KEY`: Production API key.
- `DATABASE_URL`: Address to Postgres DB.
- `MODEL_NAME`: Name of model.
- `JWT_SECRET`: Random 256-bit hash for signing authentication tokens.

---

## References
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Recharts Visualizations](https://recharts.org/)
- [Isolation Forest Anomaly Algorithm](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html)
