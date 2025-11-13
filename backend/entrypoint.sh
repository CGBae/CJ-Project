# backend/entrypoint.sh
#!/usr/bin/env sh
set -e

echo "🔧 Running Alembic migrations..."
# alembic.ini, migrations 폴더가 Dockerfile의 WORKDIR 기준에 맞게 있어야 함
alembic upgrade head

echo "🚀 Starting FastAPI (uvicorn)..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
