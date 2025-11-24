from __future__ import annotations
from typing import Optional, Literal, List 

from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import (
    BigInteger, String, Text, Integer, DateTime, CheckConstraint,
    ForeignKey, Index, Boolean, JSON
)
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.sql import func
from sqlalchemy.sql.expression import text

import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__)) 
project_root = os.path.abspath(os.path.join(current_dir, ".."))
sys.path.insert(0, project_root)

from app.db import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    kakao_id: Mapped[Optional[int]] = mapped_column(BigInteger, unique=True, index=True)
    email: Mapped[Optional[str]] = mapped_column(String, unique=True, index=True, nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String, default="therapist", nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[Optional["datetime"]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    social_provider: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    social_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=True)

    sessions: Mapped[list["Session"]] = relationship(back_populates="creator")
    
    therapist_connections: Mapped[list["Connection"]] = relationship(
        "Connection", foreign_keys="Connection.therapist_id", back_populates="therapist"
    )
    patient_connections: Mapped[list["Connection"]] = relationship(
        "Connection", foreign_keys="Connection.patient_id", back_populates="patient"
    )

ConnectionStatus = Literal["PENDING", "ACCEPTED", "REJECTED", "TERMINATED"]

class Connection(Base):
    """
    치료사와 환자 간의 연결 관계 및 상태를 관리하는 테이블.
    M:N 관계를 구현하며, 연결 요청 및 수락 과정을 지원합니다.
    """
    __tablename__ = "connections"
    __table_args__ = (
        CheckConstraint(
            "status in ('PENDING','ACCEPTED','REJECTED','TERMINATED')",
            name="ck_connections_status",
        ),
        Index("idx_connections_therapist", "therapist_id"),
        Index("idx_connections_patient", "patient_id"),
        # 중복 연결 방지를 위해 치료사-환자 쌍에 고유 인덱스 (선택 사항)
        # Index("uq_therapist_patient", "therapist_id", "patient_id", unique=True, postgresql_where=text("status = 'ACCEPTED'")),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)

    # 치료사 ID (연결 요청을 보낸/관리를 담당할 치료사)
    therapist_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # 환자 ID (연결 요청을 받은/관리를 받을 환자)
    patient_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    
    # 연결 상태: PENDING(요청 대기), ACCEPTED(수락/연결됨), REJECTED(거절), TERMINATED(종료)
    status: Mapped[str] = mapped_column(String, default="PENDING", nullable=False)
    
    # 요청 일시 및 수락/종료 일시
    requested_at: Mapped["datetime"] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    accepted_at: Mapped[Optional["datetime"]] = mapped_column(DateTime(timezone=True), nullable=True)
    terminated_at: Mapped[Optional["datetime"]] = mapped_column(DateTime(timezone=True), nullable=True)

    # 관계 설정
    therapist: Mapped["User"] = relationship(
        "User", foreign_keys=[therapist_id], back_populates="therapist_connections"
    )
    patient: Mapped["User"] = relationship(
        "User", foreign_keys=[patient_id], back_populates="patient_connections"
    )

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
    creator: Mapped["User"] = relationship(back_populates="sessions")
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
    include_instruments: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    exclude_instruments: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    
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
    track_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_sec: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    quality: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    is_favorite: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default='false'
    )

    created_at: Mapped[Optional["datetime"]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    session: Mapped["Session"] = relationship(back_populates="tracks")

    __table_args__ = (
        Index("idx_tracks_session_time", "session_id", "created_at"),
    )
    status: Mapped[str] = mapped_column(String, default="QUEUED", nullable=False)
    task_external_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

class CounselorNote(Base):
    __tablename__ = "counselor_notes"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    
    # 💡 어떤 환자에 대한 메모인지
    patient_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # 💡 어떤 상담사가 작성했는지
    therapist_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # 💡 메모 내용
    content: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    
    # (관계 설정: User 모델에도 이 관계를 추가해야 함)
    patient: Mapped["User"] = relationship(foreign_keys=[patient_id])
    therapist: Mapped["User"] = relationship(foreign_keys=[therapist_id])

    __table_args__ = (
        Index("idx_notes_patient_therapist", "patient_id", "therapist_id"),
    )

class BoardPost(Base):
    __tablename__ = "board_posts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    
    # 작성자 (User 테이블과 연결)
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    author: Mapped["User"] = relationship("User", backref="posts")
    
    # 💡 공유한 음악 (선택 사항 - Track 테이블과 연결)
    track_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tracks.id", ondelete="SET NULL"), nullable=True)
    track: Mapped[Optional["Track"]] = relationship("Track")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # 댓글 관계 (게시글이 지워지면 댓글도 삭제)
    comments: Mapped[list["BoardComment"]] = relationship("BoardComment", back_populates="post", cascade="all, delete-orphan")

    # 💡 [추가] 조회수, 태그
    views: Mapped[int] = mapped_column(Integer, default=0)
    tags: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True) # 예: ["우울", "힐링"]

    comments: Mapped[list["BoardComment"]] = relationship("BoardComment", back_populates="post", cascade="all, delete-orphan")
    # 💡 [추가] 좋아요 관계
    likes: Mapped[list["BoardLike"]] = relationship("BoardLike", back_populates="post", cascade="all, delete-orphan")

# 💡 [추가] 게시판 댓글 모델
class BoardComment(Base):
    __tablename__ = "board_comments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    
    # 작성자
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    author: Mapped["User"] = relationship("User")
    
    # 게시글
    post_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("board_posts.id", ondelete="CASCADE"), nullable=False)
    post: Mapped["BoardPost"] = relationship("BoardPost", back_populates="comments")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class BoardLike(Base):
    __tablename__ = "board_likes"
    
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    post_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("board_posts.id", ondelete="CASCADE"), primary_key=True)
    
    post: Mapped["BoardPost"] = relationship("BoardPost", back_populates="likes")