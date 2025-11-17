#!/usr/bin/env sh
set -e

echo "🔧 Running Alembic migrations..."
alembic upgrade head

echo "🚀 Starting FastAPI (uvicorn)..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000