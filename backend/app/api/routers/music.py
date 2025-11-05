from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, status # 💡 1. status 추가
from pydantic import BaseModel, Field
from sqlalchemy import select, update, insert
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.schemas import MusicTrackInfo
from app.db import get_db
# 💡 2. Connection, SessionPatientIntake 모델 import 추가
from app.models import Session, SessionPrompt, Track, User, Connection, SessionPatientIntake
from app.services.auth_service import get_current_user
from sqlalchemy.orm import joinedload
# 1. 함수 이름을 'compose_and_save'으로 변경합니다.
from app.services.elevenlabs_client import compose_and_save, ElevenLabsError

router = APIRouter(prefix="/music", tags=["music"])

# --- (ComposeReq, ComposeResp 클래스는 변경 없음) ---
class ComposeReq(BaseModel):
    session_id: int
    music_length_ms: int = Field(120_000, ge=10_000, le=300_000)
    force_instrumental: bool = True
    extra: dict | None = None

class ComposeResp(BaseModel):
    session_id: int
    track_url: str

# 💡 3. [추가] therapist.py의 권한 확인 헬퍼 함수
async def check_counselor_patient_access(
    patient_id: int,
    counselor_id: int,
    db: AsyncSession
):
    """(헬퍼 함수) 상담사가 해당 환자에게 접근 권한(ACCEPTED)이 있는지 확인"""
    q = select(Connection).where(
        Connection.therapist_id == counselor_id,
        Connection.patient_id == patient_id,
        Connection.status == "ACCEPTED"
    )
    connection = (await db.execute(q)).scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=403, detail="이 환자에 대한 접근 권한이 없습니다.")


# --- 💡 4. [핵심 수정] /compose API 권한 검사 로직 변경 ---
@router.post("/compose", response_model=ComposeResp)
async def compose_music(
    req: ComposeReq,
    db: AsyncSession = Depends(get_db),
    # [핵심 추가] 인증된 사용자만 호출하도록 추가 (변경 없음)
    current_user: User = Depends(get_current_user)
):
    # 1) 세션 확인
    session = await db.get(Session, req.session_id)
    if not session:
        raise HTTPException(404, "session not found")

    # 💡 [수정] 세션 권한 검사
    is_owner = (session.created_by == current_user.id) # 요청자가 세션 소유자(환자)인가?
    is_therapist = (current_user.role == "therapist")  # 요청자가 상담사인가?

    if is_owner:
        # 소유자(환자 또는 상담사 본인 세션)이므로 통과
        pass
    elif is_therapist:
        # 상담사일 경우, 이 세션의 소유자(환자 ID)에게 접근 권한이 있는지 확인
        try:
            patient_id = session.created_by
            await check_counselor_patient_access(patient_id, current_user.id, db)
            # 권한 확인 성공 (통과)
        except HTTPException:
            # 권한 없는 상담사
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this session (Counselor mismatch)")
    else:
        # 소유자도 아니고, 권한 있는 상담사도 아님
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this session")

    # --- (이하 로직은 변경 없음) ---
    
    # 2) 프롬프트 확인
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

    # 3) ElevenLabs 호출
    try:
        track_url = await compose_and_save(
            prompt,
            music_length_ms=req.music_length_ms,
            force_instrumental=req.force_instrumental,
            extra=req.extra,
        )
    except ElevenLabsError as e:
        raise HTTPException(502, f"music provider error: {e}")

    # 4) DB 기록
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


# --- (/my API는 변경 없음, track_url 필드명 수정된 버전) ---
@router.get("/my", response_model=List[MusicTrackInfo])
async def get_my_music(
    limit: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """현재 로그인한 사용자가 생성한 음악 트랙 목록을 최신순으로 반환합니다."""
    query = (
        select(Track)
        .options(joinedload(Track.session))
        .join(Session, Track.session_id == Session.id)
        .where(Session.created_by == current_user.id)
        .order_by(Track.created_at.desc())
    )
    
    # limit() 적용 로직
    if limit is not None:
        query = query.limit(limit)
        
    result = await db.execute(query)
    tracks = result.scalars().unique().all()

    response_tracks = []
    for track in tracks:
        # 프롬프트 추출 로직
        session_prompt_data = track.session.prompt or {}
        session_prompt_text = "프롬프트 정보 없음"
        if isinstance(session_prompt_data, dict) and "text" in session_prompt_data:
            value = session_prompt_data["text"]
            if isinstance(value, str):
                session_prompt_text = value
            else:
                session_prompt_text = "프롬프트 형식 오류 (값이 문자열 아님)"
        elif session_prompt_data is not None:
             session_prompt_text = "프롬프트 형식 오류 (DB 데이터 확인 필요)"
             
        response_tracks.append(MusicTrackInfo(
            id=track.id,
            title=f"AI 생성 트랙 (세션 {track.session_id})",
            prompt=session_prompt_text,
            track_url=track.track_url # 👈 schemas.py와 일치
        ))

    return response_tracks