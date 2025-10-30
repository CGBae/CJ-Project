from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, update, insert
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.schemas import MusicTrackInfo
from app.db import get_db
from app.models import Session, SessionPrompt, Track, User
from app.services.auth_service import get_current_user
from sqlalchemy.orm import joinedload
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
async def compose_music(
    req: ComposeReq,
    db: AsyncSession = Depends(get_db),
    # 💡 [핵심 추가] 인증된 사용자만 호출하도록 추가
    current_user: User = Depends(get_current_user)
):
    # 1) 세션/최종 프롬프트 확인
    session = await db.get(Session, req.session_id)
    if not session:
        raise HTTPException(404, "session not found")
    # 💡 [핵심 추가] 세션이 현재 사용자의 것인지 확인
    if session.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized for this session")
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

@router.get("/my", response_model=List[MusicTrackInfo])
async def get_my_music(
    limit: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """현재 로그인한 사용자가 생성한 음악 트랙 목록을 최신순으로 반환합니다."""
    query = (
        select(Track)
        # 💡 2. options(joinedload(Track.session)) 추가: Track 조회 시 Session 정보도 함께 로드
        .options(joinedload(Track.session))
        .join(Session, Track.session_id == Session.id)
        .where(Session.created_by == current_user.id)
        .order_by(Track.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    # 💡 3. unique() 추가: joinedload 시 중복 방지
    tracks = result.scalars().unique().all()

    response_tracks = []
    for track in tracks:
        # 💡 [수정 시작] 프롬프트 추출 로직 개선
        session_prompt_data = track.session.prompt # Session.prompt 컬럼 값 (None 또는 dict)
        session_prompt_text = "프롬프트 정보 없음" # 기본값 설정

        # 1. session_prompt_data가 딕셔너리이고 'text' 키를 가지고 있는지 확인
        if isinstance(session_prompt_data, dict) and "text" in session_prompt_data:
            value = session_prompt_data["text"]
            # 2. 'text' 키의 값이 실제로 문자열인지 확인
            if isinstance(value, str):
                session_prompt_text = value # 성공적으로 문자열 추출
            else:
                # 'text' 키는 있지만 값이 문자열이 아닌 경우
                session_prompt_text = "프롬프트 형식 오류 (값이 문자열 아님)"
        elif session_prompt_data is not None:
             # prompt 데이터는 있지만 딕셔너리가 아니거나 'text' 키가 없는 경우
             session_prompt_text = "프롬프트 형식 오류 (DB 데이터 확인 필요)"

        response_tracks.append(MusicTrackInfo(
            id=track.id,
            title=f"AI 생성 트랙 (세션 {track.session_id})", # 임시 제목
            prompt=session_prompt_text, # 추출된 프롬프트 또는 오류 메시지
            audioUrl=track.track_url # 필드명 확인
        ))

    return response_tracks