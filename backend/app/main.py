# /backend/app/main.py

from __future__ import annotations
import os
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.api.routers import patient, therapist, chat, music, auth, sessions, user, connection, board, messenger
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from app.kafka import start_kafka, stop_kafka

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 앱 시작 시
    await start_kafka()
    try:
        # 여기가 실제 앱이 돌아가는 구간
        yield
    finally:
        # 앱 종료 시
        await stop_kafka()

app = FastAPI(
    title="TheraMusic API",
    lifespan=lifespan,
)

origins = [
    "http://210.104.76.200",
    "http://210.104.76.200:80",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # (추후 배포 시 프론트엔드 도메인 추가)
]

# 💡 1. CORS 미들웨어를 가장 먼저 등록합니다.
# 이렇게 해야 모든 API 요청에 CORS 정책이 적용됩니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static/audio", exist_ok=True) # 폴더가 없으면 생성
app.mount("/static", StaticFiles(directory="static"), name="static")

# 💡 2. [핵심] /static 경로 마운트 (라우터 포함 전에 추가)
# (static 폴더가 app 폴더 내부에 있다고 가정)
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)
    print(f"Created static directory at: {static_dir}")
    
app.mount("/static", StaticFiles(directory=static_dir), name="static")
print(f"Serving static files from: {static_dir}")


# 💡 2. 그 다음에 API 라우터들을 등록합니다.
app.include_router(chat.router)
app.include_router(patient.router)
app.include_router(therapist.router)
app.include_router(music.router)
app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(user.router)
app.include_router(connection.router)
app.include_router(board.router)
app.include_router(messenger.router)


@app.get("/health")
async def health():
    return {"ok": True}

@app.get("/db-health")
async def db_health(db: AsyncSession = Depends(get_db)):
    # 간단한 ping
    result = await db.execute("SELECT 1")
    return {"db": "ok", "result": result.scalar_one()}