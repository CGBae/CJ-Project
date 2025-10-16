from __future__ import annotations
from typing import Optional, Literal

from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import (
    BigInteger, String, Text, Integer, DateTime, CheckConstraint,
    ForeignKey, Index
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from backend.app.db import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String, default="therapist", nullable=False)
    created_at: Mapped[Optional["datetime"]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    sessions: Mapped[list["Session"]] = relationship(back_populates="creator")


Status = Literal["QUEUED", "PROCESSING", "READY", "FAILED"]

class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint(
            "status in ('QUEUED','PROCESSING','READY','FAILED')",
            name="ck_sessions_status",
        ),
        CheckConstraint(
            "initiator_type in ('patient','therapist') or initiator_type is null", 
            name="ck_sessions_initiator",
        ),
        CheckConstraint(
            "input_source in ('patient_analyzed','therapist_manual','fallback') or input_source is null", 
            name="ck_sessions_input_source",
        ),
        Index("idx_sessions_status", "status"),
        Index("idx_sessions_created_by", "created_by"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    created_by: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    status: Mapped[str] = mapped_column(String, default="QUEUED", nullable=False)
    
    initiator_type: Mapped[str | None] = mapped_column(String, nullable=True)      # 'patient' | 'therapist'
    guideline_version: Mapped[str | None] = mapped_column(String, default="v1")
    input_source: Mapped[str | None] = mapped_column(String, nullable=True)
    
    # 최종 프롬프트(장르/BPM/가사/목표 등)
    prompt: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # 생성 결과 URL & 메타
    track_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    created_at: Mapped[Optional["datetime"]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[Optional["datetime"]] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    patient_intake: Mapped["SessionPatientIntake | None"] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
    )
    therapist_manual: Mapped["TherapistManualInputs | None"] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
    )
    messages: Mapped[list["ConversationMessage"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    prompts: Mapped[list["SessionPrompt"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    tracks: Mapped[list["Track"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )

class SessionPatientIntake(Base):
    __tablename__ = "session_patient_intake"
    session_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True)
    vas: Mapped[dict | None] = mapped_column(JSONB)
    prefs: Mapped[dict | None] = mapped_column(JSONB)
    goal: Mapped[dict | None] = mapped_column(JSONB)
    has_dialog: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["Session"] = relationship(back_populates="patient_intake")

class TherapistManualInputs(Base):
    __tablename__ = "therapist_manual_inputs"
    session_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True)
    genre: Mapped[str | None] = mapped_column(String)
    mood: Mapped[str | None] = mapped_column(String)
    bpm_min: Mapped[int | None] = mapped_column()
    bpm_max: Mapped[int | None] = mapped_column()
    key_signature: Mapped[str | None] = mapped_column(String)
    vocals_allowed: Mapped[bool | None] = mapped_column()
    include_instruments: Mapped[list[str] | None] = mapped_column(postgresql.ARRAY(String))
    exclude_instruments: Mapped[list[str] | None] = mapped_column(postgresql.ARRAY(String))
    duration_sec: Mapped[int | None] = mapped_column()
    notes: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["Session"] = relationship(back_populates="therapist_manual")

class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        # ('user','assistant','therapist','system') 중 하나 권장
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    meta: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[Optional["datetime"]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    session: Mapped["Session"] = relationship(back_populates="messages")

    __table_args__ = (
        Index("idx_conv_msg_session_time", "session_id", "created_at"),
    )


class SessionPrompt(Base):
    __tablename__ = "session_prompts"
    # stage: user_input | analyzed | final
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    stage: Mapped[str] = mapped_column(String, nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    confidence: Mapped[Optional[float]] = mapped_column(nullable=True)

    created_at: Mapped[Optional["datetime"]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    session: Mapped["Session"] = relationship(back_populates="prompts")


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    track_url: Mapped[str] = mapped_column(Text, nullable=False)
    duration_sec: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    quality: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[Optional["datetime"]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    session: Mapped["Session"] = relationship(back_populates="tracks")

    __table_args__ = (
        Index("idx_tracks_session_time", "session_id", "created_at"),
    )