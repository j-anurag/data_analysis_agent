import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

# Import session & Base to seed db on startup
from backend.app.db.session import engine, Base, SessionLocal
from backend.app.models.models import User
from backend.app.db.seed import seed_database

# Create tables and seed on startup if database is empty
try:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # Check if we already have users
    if db.query(User).count() == 0:
        print("Database is empty. Seeding historical enterprise data...")
        db.close()
        try:
            seed_database()
        except Exception as seed_err:
            print(f"Failed to seed database: {seed_err}")
    else:
        db.close()
except Exception as e:
    print(f"Error initializing database: {e}")

app = FastAPI(title="data_analysis_agent API Gateway", version="0.1.0")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
from .routers import health
from backend.app.api.routes import auth, agent, tools, dashboards, reports

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(agent.router, prefix="/api/v1")
app.include_router(tools.router, prefix="/api/v1")
app.include_router(dashboards.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")

# Mount reports static files
static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../static"))
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")
