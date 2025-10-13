# backend/db.py
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

ASYNC_DB_URL = os.getenv("ASYNC_DATABASE_URL", "postgresql+asyncpg://cj_user:1234@localhost:5432/cj_db")

class Base(DeclarativeBase):
    pass

engine = create_async_engine(ASYNC_DB_URL, echo=False, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def get_db():
    async with SessionLocal() as session:
        yield session
