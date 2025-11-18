from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, status # 💡 1. status 추가
from pydantic import BaseModel, Field
from sqlalchemy import select, update, insert
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.schemas import MusicTrackInfo, MusicTrackDetail, SimpleChatMessage, SimpleIntakeData, TherapistManualInput
from app.db import get_db
# 💡 2. Connection, SessionPatientIntake 모델 import 추가
from app.models import Session, SessionPrompt, Track, User, Connection, SessionPatientIntake, ConversationMessage, TherapistManualInputs
from app.services.auth_service import get_current_user
from sqlalchemy.orm import joinedload, selectinload
# 1. 함수 이름을 'compose_and_save'으로 변경합니다.
from app.services.elevenlabs_client import compose_and_save, ElevenLabsError
from app.api.routers.therapist import check_counselor_patient_access
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
    """
    (신규) 트랙 ID 1개로 음악 상세 정보 (트랙, 가사, 접수 기록, 채팅 내역)를
    가져옵니다.
    """
    
    # 1. 트랙 및 관련 세션, 접수 기록, 채팅 기록을 한 번에 조인(join)해서 가져옴
    query = (
        select(Track)
        .where(Track.id == track_id)
        .options(
            joinedload(Track.session).options( # 1. 세션 로드
                joinedload(Session.patient_intake), # 2-1. 환자 Intake 로드
                joinedload(Session.therapist_manual), # 2-2. 상담사 처방 로드
                selectinload(Session.messages) # 2-3. 채팅 내역 로드
            )
        )
    )
    
    result = await db.execute(query)
    track = result.scalars().unique().first()

    if not track or not track.session:
        raise HTTPException(status_code=404, detail="트랙 또는 세션 정보를 찾을 수 없습니다.")
        
    session = track.session
    # 2. 보안 검사: 이 트랙이 현재 로그인한 사용자의 것인지 확인
    # (또는 이 사용자가 환자를 담당하는 상담사인지 확인 - therapist.py의 check_counselor_patient_access 로직)
    if session.created_by != current_user.id:
        if current_user.role == "therapist":
            try:
                await check_counselor_patient_access(session.created_by, current_user.id, db)
            except HTTPException:
                 raise HTTPException(status_code=403, detail="권한 없음")
        else:
            raise HTTPException(status_code=403, detail="권한 없음")
    # 3. 데이터 가공
    
    # 가사 (Session.prompt JSON에서 추출)
    lyrics = None
    if isinstance(session.prompt, dict):
        lyrics = session.prompt.get("lyrics_text")

    # 접수 기록 (SimpleIntakeData 스키마로 변환)
    intake_data = None
    if session.patient_intake:
        # 💡 [수정] session.patient_intake가 로드되었는지 확인
        print(f"DEBUG: Patient Intake Found for Session {session.id}")
        intake_data = SimpleIntakeData(
            goal_text=session.patient_intake.goal.get("text") if isinstance(session.patient_intake.goal, dict) else "N/A",
            vas=session.patient_intake.vas, 
            prefs=session.patient_intake.prefs 
        )
    else:
        print(f"DEBUG: No Patient Intake for Session {session.id}")

    therapist_manual = None
    if session.therapist_manual:
        print(f"DEBUG: Therapist Manual Found for Session {session.id}")
        therapist_manual = TherapistManualInput.model_validate(session.therapist_manual)
        
    # 채팅 기록 (SimpleChatMessage 스키마 리스트로 변환)
    chat_history = []
    if session.messages: # 👈 [수정] chat_history -> messages
        chat_history = [
            SimpleChatMessage(id=msg.id, role=msg.role, content=msg.content)
            for msg in session.messages # 👈 [수정] chat_history -> messages
        ]
    
    # 💡 4. [핵심 수정] NameError 해결: 'title' 변수 정의를 return 위로 이동
    intake = session.patient_intake
    title = f"AI 트랙 (세션 {track.session_id})" # 기본값
    if session.initiator_type == "therapist":
        title = f"상담사 처방 음악 (세션 {track.session_id})"
    elif session.initiator_type == "patient":
        if intake and intake.has_dialog:
            title = f"AI 상담 기반 음악 (세션 {track.session_id})"
        else:
            title = f"작곡 체험 음악 (세션 {track.session_id})"
        
    # 4. 최종 응답 반환 (MusicTrackDetail 스키마)
    return MusicTrackDetail(
        id=track.id,
        title=title, # 👈 동적 제목
        prompt=session.prompt.get("music_prompt") or session.prompt.get("text") or "프롬프트 없음" if isinstance(session.prompt, dict) else "프롬프트 없음",
        track_url=track.track_url,
        audioUrl=track.track_url,
        
        session_id=session.id, # 👈 세션 ID
        initiator_type=session.initiator_type, # 👈 세션 타입
        has_dialog=intake.has_dialog if intake else False, # 👈 대화 유무
        created_at=track.created_at,
        is_favorite=track.is_favorite,
        lyrics=lyrics,
        intake_data=intake_data,
        therapist_manual=therapist_manual,
        chat_history=chat_history
    )