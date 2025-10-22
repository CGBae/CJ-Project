from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update, insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Session, SessionPrompt, Track
# 1. 함수 이름을 'compose_and_save'으로 변경합니다.
from app.services.elevenlabs_client import compose_and_save, ElevenLabsError

router = APIRouter(prefix="/music", tags=["music"])

class ComposeReq(BaseModel):
    session_id: int
    music_length_ms: int = Field(120_000, ge=10_000, le=300_000)
    force_instrumental: bool = True
    extra: dict | None = None

class ComposeResp(BaseModel):
    session_id: int
    track_url: str

@router.post("/compose", response_model=ComposeResp)
async def compose_music(req: ComposeReq, db: AsyncSession = Depends(get_db)):
    # 1) 세션/최종 프롬프트 확인
    session = await db.get(Session, req.session_id)
    if not session:
        raise HTTPException(404, "session not found")
    prompt = (session.prompt or {}).get("text")
    if not prompt:
        q = select(SessionPrompt.data).where(
            SessionPrompt.session_id == req.session_id,
            SessionPrompt.stage == "final",
        ).order_by(SessionPrompt.created_at.desc())
        row = (await db.execute(q)).first()
        prompt = (row[0] or {}).get("text") if row else None
    if not prompt:
        raise HTTPException(400, "no final prompt for this session")

    # 2) ElevenLabs 호출
    try:
        # 2. 호출하는 함수 이름을 'compose_and_save'으로 변경합니다.
        track_url = await compose_and_save(
            prompt,
            music_length_ms=req.music_length_ms,
            force_instrumental=req.force_instrumental,
            extra=req.extra,
        )
    except ElevenLabsError as e:
        raise HTTPException(502, f"music provider error: {e}")

    # 3) DB 기록 (tracks + sessions.track_url)
    await db.execute(insert(Track).values(
        session_id=req.session_id,
        track_url=track_url,
        duration_sec=int(req.music_length_ms / 1000),
        provider="ElevenLabs",
        quality=req.extra.get("preset") if req.extra else None,
    ))
    await db.execute(update(Session).where(Session.id==req.session_id).values(
        track_url=track_url, provider="ElevenLabs"
    ))
    await db.commit()

    return ComposeResp(session_id=req.session_id, track_url=track_url)