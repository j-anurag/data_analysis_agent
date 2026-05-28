.PHONY: setup backend frontend run clean

setup:
	@echo "Setting up backend virtual environment and dependencies..."
	python3 -m venv .venv
	.venv/bin/pip install -r backend/requirements.txt
	@echo "Setting up frontend dependencies..."
	cd frontend && npm install
	@echo "Setup complete! Run 'make run' to launch both servers."

backend:
	@echo "Starting FastAPI backend server..."
	.venv/bin/uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000

frontend:
	@echo "Starting Next.js frontend dev server..."
	cd frontend && npm run dev

run:
	@echo "Launching backend and frontend concurrently..."
	npx concurrently -k \
		-n "backend,frontend" \
		-c "blue,green" \
		"make backend" \
		"make frontend"

clean:
	@echo "Cleaning cache and build files..."
	find . -type d -name "__pycache__" -exec rm -rf {} +
	rm -rf frontend/.next
