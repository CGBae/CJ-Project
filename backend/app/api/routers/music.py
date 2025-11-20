from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, status # 💡 1. status 추가
from pydantic import BaseModel, Field
from sqlalchemy import select, update, insert, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Literal, Optional
import json
from app.schemas import MusicTrackInfo, MusicTrackDetail, SimpleChatMessage, SimpleIntakeData, TherapistManualInput
from app.db import get_db
# 💡 2. Connection, SessionPatientIntake 모델 import 추가
from app.models import Session, SessionPrompt, Track, User, Connection, SessionPatientIntake, ConversationMessage, TherapistManualInputs
from app.services.auth_service import get_current_user
from sqlalchemy.orm import joinedload, selectinload
# 1. 함수 이름을 'compose_and_save'으로 변경합니다.
from app.services.elevenlabs_client import compose_and_save, ElevenLabsError
from app.api.routers.therapist import check_counselor_patient_access
from app.kafka import producer
import os, uuid, datetime as dt
router = APIRouter(prefix="/music", tags=["music"])

# --- (ComposeReq, ComposeResp 클래스는 변경 없음) ---
class ComposeReq(BaseModel):
    session_id: int
    music_length_ms: int = Field(120_000, ge=10_000, le=300_000)
    force_instrumental: bool = True
    extra: dict | None = None

class ComposeResp(BaseModel):
    session_id: int
    track_id: int
    status: Literal["QUEUED", "PROCESSING", "READY", "FAILED"]
    track_url: Optional[str] = None

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
    
    prompt_data = session.prompt if isinstance(session.prompt, dict) else {}
    prompt_text = prompt_data.get("music_prompt") or prompt_data.get("text") or ""
    
    # 2) Track 레코드 생성
    new_track = Track(
        session_id=req.session_id,
        status="QUEUED",
        provider="ElevenLabs",
        prompt=prompt_text,
        duration_sec=int(req.music_length_ms / 1000),
        quality=req.extra.get("preset") if req.extra else None,
    )
    db.add(new_track)
    await db.flush()  # new_track.id 확보

    # 3) Kafka 메시지 발행
    if not producer:
        raise HTTPException(503, "music queue not available")
    payload = {
        "task_id": new_track.id,
        "session_id": req.session_id,
        "prompt": prompt_text,
        "music_length_ms": req.music_length_ms,
        "force_instrumental": req.force_instrumental,
        "extra": req.extra or {},
    }
    await producer.send_and_wait(
        os.getenv("KAFKA_TOPIC_REQUESTS", "music.gen.requests"),
        key=new_track.id,
        value=payload,
    )

    await db.commit()

    return {
        "session_id": req.session_id,
        "track_id": new_track.id,
        "status": new_track.status,
        "track_url": None,
    }


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
        .options(
            joinedload(Track.session).options(
                joinedload(Session.patient_intake)
            )
        )
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
        session = track.session
        intake = session.patient_intake
        
        # 💡 [수정] 동적 제목 생성
        title = f"AI 트랙 (세션 {track.session_id})" # 기본값
        if session.initiator_type == "therapist":
            title = f"상담사 처방 음악 (세션 {track.session_id})"
        elif session.initiator_type == "patient":
            if intake and intake.has_dialog:
                title = f"AI 상담 기반 음악 (세션 {track.session_id})"
            else:
                title = f"작곡 체험 음악 (세션 {track.session_id})"
        
        session_prompt_data = session.prompt or {}
        session_prompt_text = session_prompt_data.get("music_prompt") or session_prompt_data.get("text") or "프롬프트 정보 없음"
             
        response_tracks.append(MusicTrackInfo(
            id=track.id,
            title=title, # 👈 동적 제목
            prompt=session_prompt_text,
            track_url=track.track_url,
            session_id=session.id, # 👈 세션 ID
            initiator_type=session.initiator_type, # 👈 세션 타입
            has_dialog=intake.has_dialog if intake else False, # 👈 대화 유무
            created_at=track.created_at,
            is_favorite=track.is_favorite
        ))

    return response_tracks

@router.get("/my/favorites", response_model=List[MusicTrackInfo])
async def get_my_favorite_music(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """(신규) 현재 로그인한 사용자가 '즐겨찾기'한 음악 목록만 반환합니다."""
    query = (
        select(Track)
        .options(
            joinedload(Track.session).options(
                joinedload(Session.patient_intake)
            )
        )
        .join(Session, Track.session_id == Session.id)
        .where(
            Session.created_by == current_user.id,
            Track.is_favorite == True # 👈 즐겨찾기 필터
        )
        .order_by(Track.created_at.desc())
    )
        
    result = await db.execute(query)
    tracks = result.scalars().unique().all()
    
    # (위 /my API의 반환 로직과 동일)
    response_tracks = []
    for track in tracks:
        session = track.session
        intake = session.patient_intake
        title = f"AI 트랙"
        if session.initiator_type == "therapist": title = "상담사 처방 음악"
        elif session.initiator_type == "patient":
            if intake and intake.has_dialog: title = "AI 상담 기반 음악"
            else: title = "작곡 체험 음악"
        session_prompt_text = (session.prompt or {}).get("music_prompt", "프롬프트 없음")
             
        response_tracks.append(MusicTrackInfo(
            id=track.id, title=title, prompt=session_prompt_text, track_url=track.track_url,
            session_id=session.id, initiator_type=session.initiator_type,
            has_dialog=intake.has_dialog if intake else False,
            created_at=track.created_at, is_favorite=track.is_favorite
        ))
    return response_tracks


# 💡 [핵심 API 추가] 즐겨찾기 토글(Toggle) API
class FavoriteResponse(BaseModel):
    track_id: int
    is_favorite: bool

@router.post("/track/{track_id}/toggle-favorite", response_model=FavoriteResponse)
async def toggle_favorite_track(
    track_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """(신규) 트랙 1개의 'is_favorite' 상태를 토글(Toggles)합니다."""
    
    query = (
        select(Track)
        .options(joinedload(Track.session)) # 👈 소유권 확인을 위해 세션 로드
        .where(Track.id == track_id)
    )
    result = await db.execute(query)
    track = result.scalars().unique().first()

    if not track or not track.session or not track.session.created_by:
        raise HTTPException(status_code=404, detail="트랙 또는 세션 정보를 찾을 수 없습니다.")
        
    session = track.session

    # 보안 검사 (환자 본인만 즐겨찾기 가능)
    if session.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="이 트랙에 접근할 권한이 없습니다.")
            
    # 상태 토글
    track.is_favorite = not track.is_favorite
    
    try:
        db.add(track)
        await db.commit()
        await db.refresh(track)
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, f"즐겨찾기 업데이트 실패: {e}")
        
    return FavoriteResponse(track_id=track.id, is_favorite=track.is_favorite)



@router.get("/track/{track_id}", response_model=MusicTrackDetail)
async def get_track_details(
    track_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. 트랙과 세션 기본 정보 로드
    query = (
        select(Track)
        .where(Track.id == track_id)
        .options(
            joinedload(Track.session).options(
                joinedload(Session.patient_intake), 
                joinedload(Session.therapist_manual),
                selectinload(Session.messages) 
            )
        )
    )
    result = await db.execute(query)
    track = result.scalars().unique().first()

    if not track or not track.session:
        raise HTTPException(status_code=404, detail="트랙 정보를 찾을 수 없습니다.")
        
    session = track.session

    # 2. 보안 검사
    if session.created_by != current_user.id:
        if current_user.role == "therapist":
            try:
                await check_counselor_patient_access(session.created_by, current_user.id, db)
            except HTTPException:
                 raise HTTPException(status_code=403, detail="권한 없음")
        else:
            raise HTTPException(status_code=403, detail="권한 없음")

    # --- 3. 데이터 로딩 (JSON 스냅샷 우선 전략) ---
    
    # (A) 환자 Intake 데이터 복구
    intake_data = None
    
    # 1순위: SessionPrompt (user_input) JSON 로그 확인
    q_prompt = select(SessionPrompt).where(SessionPrompt.session_id == session.id, SessionPrompt.stage == "user_input").order_by(desc(SessionPrompt.created_at)).limit(1)
    snapshot = (await db.execute(q_prompt)).scalar_one_or_none()
    
    if snapshot and snapshot.data:
        # JSON 데이터가 있으면 이걸 사용 (가장 정확함)
        data = snapshot.data
        goal = data.get("goal", {})
        intake_data = SimpleIntakeData(
            goal_text=goal.get("text") if isinstance(goal, dict) else "N/A",
            vas=data.get("vas"),
            prefs=data.get("prefs")
        )
    else:
        # 2순위: DB 테이블 확인 (Fallback)
        p_intake = session.patient_intake
        if not p_intake:
            q_pi = select(SessionPatientIntake).where(SessionPatientIntake.session_id == session.id)
            p_intake = (await db.execute(q_pi)).scalar_one_or_none()
            
        if p_intake:
            intake_data = SimpleIntakeData(
                goal_text=p_intake.goal.get("text") if isinstance(p_intake.goal, dict) else "N/A",
                vas=p_intake.vas, 
                prefs=p_intake.prefs 
            )

    # (B) 상담사/작곡가 처방 데이터 복구
    therapist_manual = None
    
    # 1순위: SessionPrompt (manual) JSON 로그 확인 💡 [핵심]
    q_manual_prompt = select(SessionPrompt).where(SessionPrompt.session_id == session.id, SessionPrompt.stage == "manual").order_by(desc(SessionPrompt.created_at)).limit(1)
    manual_snapshot = (await db.execute(q_manual_prompt)).scalar_one_or_none()
    
    if manual_snapshot and manual_snapshot.data:
        print(f"DEBUG: Manual Snapshot Found! Using JSON data.")
        manual_data = manual_snapshot.data
        
        # (호환성 처리: mainInstrument가 없으면 include_instruments[0] 사용)
        if "mainInstrument" not in manual_data:
             if manual_data.get("include_instruments") and len(manual_data["include_instruments"]) > 0:
                 manual_data["mainInstrument"] = manual_data["include_instruments"][0]
             else:
                 manual_data["mainInstrument"] = "Piano"
        
        # Pydantic 모델로 변환 (모든 필드 포함됨)
        therapist_manual = TherapistManualInput(**manual_data)
        
    else:
        # 2순위: DB 테이블 확인 (Fallback)
        t_manual = session.therapist_manual
        if not t_manual:
            q_tm = select(TherapistManualInputs).where(TherapistManualInputs.session_id == session.id)
            t_manual = (await db.execute(q_tm)).scalar_one_or_none()

        if t_manual:
            print(f"DEBUG: Using DB Table for Manual Data")
            # DB 객체 -> Pydantic 변환 (필드 누락 방지를 위해 수동 매핑)
            therapist_manual = TherapistManualInput(
                genre=t_manual.genre,
                mood=t_manual.mood,
                bpm_min=t_manual.bpm_min,
                bpm_max=t_manual.bpm_max,
                key_signature=t_manual.key_signature,
                vocals_allowed=t_manual.vocals_allowed,
                include_instruments=t_manual.include_instruments,
                exclude_instruments=t_manual.exclude_instruments,
                duration_sec=t_manual.duration_sec,
                notes=t_manual.notes,
                # DB에 컬럼이 없을 수 있으므로 getattr로 안전하게 접근
                harmonic_dissonance=getattr(t_manual, 'harmonic_dissonance', 'Neutral'),
                rhythm_complexity=getattr(t_manual, 'rhythm_complexity', 'Neutral'),
                melody_contour=getattr(t_manual, 'melody_contour', 'Neutral'),
                texture_density=getattr(t_manual, 'texture_density', 'Neutral'),
                mainInstrument=t_manual.include_instruments[0] if t_manual.include_instruments else "Piano"
            )

    # (C) 채팅 내역
    chat_history = [SimpleChatMessage.model_validate(msg) for msg in session.messages] if session.messages else []
    
    # (D) 가사 및 프롬프트
    prompt_data = session.prompt if isinstance(session.prompt, dict) else {}
    lyrics = prompt_data.get("lyrics_text")
    prompt_text = prompt_data.get("music_prompt") or prompt_data.get("text") or "프롬프트 없음"

    # (E) 제목 및 타입
    title = f"AI 트랙 (세션 {session.id})"
    if session.initiator_type == "therapist": 
        title = f"상담사 처방 음악"
    elif session.initiator_type == "patient":
        if intake_data and chat_history: 
            title = f"AI 상담 기반 음악"
        elif therapist_manual: 
            title = f"작곡 체험 음악"
        else:
            title = f"AI 생성 음악"

    return MusicTrackDetail(
        id=track.id,
        title=title, 
        prompt=prompt_text,
        track_url=track.track_url,
        audioUrl=track.track_url,
        session_id=session.id,
        initiator_type=session.initiator_type,
        has_dialog=bool(intake_data), 
        created_at=track.created_at, 
        is_favorite=track.is_favorite,
        
        lyrics=lyrics,
        intake_data=intake_data,        
        therapist_manual=therapist_manual,
        chat_history=chat_history       
    )