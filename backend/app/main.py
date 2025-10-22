# /backend/app/main.py

from __future__ import annotations
import os
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.api.routers import patient, therapist, chat, music
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="TheraMusic API")

# 💡 1. CORS 미들웨어를 가장 먼저 등록합니다.
# 이렇게 해야 모든 API 요청에 CORS 정책이 적용됩니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static/audio", exist_ok=True) # 폴더가 없으면 생성
app.mount("/static", StaticFiles(directory="static"), name="static")

# 💡 2. 그 다음에 API 라우터들을 등록합니다.
app.include_router(chat.router)
app.include_router(patient.router)
app.include_router(therapist.router)
app.include_router(music.router)


@app.get("/health")
async def health():
    return {"ok": True}

@app.get("/db-health")
async def db_health(db: AsyncSession = Depends(get_db)):
    # 간단한 ping
    result = await db.execute("SELECT 1")
    return {"db": "ok", "result": result.scalar_one()}