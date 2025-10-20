from __future__ import annotations

import os
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.api.routers import patient, therapist

app = FastAPI(title="TheraMusic API")

app.include_router(patient.router)
app.include_router(therapist.router)

# 프론트(3000)에서 호출 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"ok": True}

@app.get("/db-health")
async def db_health(db: AsyncSession = Depends(get_db)):
    # 간단한 ping
    result = await db.execute("SELECT 1")
    return {"db": "ok", "result": result.scalar_one()}