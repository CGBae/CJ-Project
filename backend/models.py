# backend/models.py
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import BigInteger, String, Text, JSON, ForeignKey
from db import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String, default="therapist")

class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    patient_id: Mapped[int] = mapped_column(BigInteger)
    target_metric: Mapped[dict | None] = mapped_column(JSON)