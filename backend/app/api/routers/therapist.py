from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import insert, update, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional # 💡 Optional 추가
from app.models import User, Session, TherapistManualInputs, SessionPrompt, Connection, Track, SessionPatientIntake
from app.services.auth_service import get_current_user
from app.schemas import (
    TherapistPromptReq, SessionCreateResp, PromptResp, TherapistManualInput, 
    FoundPatientResponse, UserPublic, SessionInfo, MusicTrackInfo,
    CounselorStats, RecentMusicTrack
)
from app.db import get_db
from sqlalchemy.orm import joinedload
from app.services.openai_client import generate_prompt_from_guideline
from app.services.prompt_from_guideline import build_extra_requirements_for_therapist

router = APIRouter(prefix="/therapist", tags=["therapist"])

# /new API가 받을 요청 본문(body) 스키마
class CreateSessionForPatientReq(BaseModel):
    patient_id: int 

# 권한 확인 헬퍼 함수
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


# 상담사가 환자를 위해 세션 생성 (/intake/counselor)
@router.post("/new", response_model=SessionCreateResp)
async def create_session_for_patient( 
    req: CreateSessionForPatientReq, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user) 
):
    """(수정됨) 상담사가 선택한 환자를 위해 새 세션을 생성합니다."""
    
    if current_user.role != "therapist":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="상담사만 이 세션을 생성할 수 있습니다."
        )
        
    await check_counselor_patient_access(req.patient_id, current_user.id, db)

    res = await db.execute(
        insert(Session)
        .values(
            initiator_type="therapist", 
            status="QUEUED",
            created_by=req.patient_id  # 세션 소유자 = 환자
        ).returning(Session.id)
    )
    session_id = res.scalar_one()
    await db.commit()
    return {"session_id": session_id, "status": "QUEUED"}


# (환자/상담사 공용) 수동 프롬프트 생성
@router.post("/manual-generate", response_model=PromptResp)
async def manual_generate(
    req: TherapistPromptReq,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. 세션 확인
    session = await db.get(Session, req.session_id) 
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session (ID: {req.session_id}) not found."
        )
    if not session.created_by: # 👈 created_by가 NULL인 경우 방어
         raise HTTPException(status_code=403, detail="세션 소유자가 지정되지 않았습니다.")

    # 💡 2. [핵심 수정] 권한 검사 (환자/상담사 분리)
    if current_user.role == "patient":
        # "환자"는 "본인" 세션만 수정 가능
        if session.created_by != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized (Patient mismatch).")
    elif current_user.role == "therapist":
        # "상담사"는 "배정된 환자"의 세션만 수정 가능
        try:
            await check_counselor_patient_access(session.created_by, current_user.id, db)
        except HTTPException:
            # (추가) 상담사 본인이 만든 세션도 허용 (테스트용 등)
            if session.created_by != current_user.id:
                raise HTTPException(status_code=403, detail="Not authorized (Counselor mismatch).")
    else:
        # 그 외 역할
         raise HTTPException(status_code=403, detail="Not authorized (Invalid role).")
            
    # 3. manual 입력 upsert (기존 로직)
    await db.execute(
        insert(TherapistManualInputs).values(
            session_id=req.session_id,
            genre=req.manual.genre,
            mood=req.manual.mood,
            bpm_min=req.manual.bpm_min,
            bpm_max=req.manual.bpm_max,
            key_signature=req.manual.key_signature,
            vocals_allowed=req.manual.vocals_allowed,
            include_instruments=req.manual.include_instruments,
            exclude_instruments=req.manual.exclude_instruments,
            duration_sec=req.manual.duration_sec,
            notes=req.manual.notes
        )
    )
    # manual 스냅샷
    await db.execute(
        insert(SessionPrompt).values(
            session_id=req.session_id, stage="manual", data=req.manual.model_dump()
        )
    )
    await db.commit()

    # 4. 상담사용 '추가 요구사항' 텍스트 구성 (기존 로직)
    extra = build_extra_requirements_for_therapist(req.manual.model_dump())

    # 5. OpenAI 호출 (기존 로직)
    prompt_dict = await generate_prompt_from_guideline(req.guideline_json, extra)

    # 6. DB 저장 로직 (올바른 형식)
    final_music_prompt = prompt_dict.get("music_prompt", "기본 프롬프트: 잔잔한 음악")
    final_lyrics = prompt_dict.get("lyrics_text", "")
    final_data_to_save = {
        "text": final_music_prompt,
        "music_prompt": final_music_prompt,
        "lyrics_text": final_lyrics
    }
    await db.execute(
        insert(SessionPrompt).values(session_id=req.session_id, stage="final", data=final_data_to_save)
    )
    await db.execute(
        update(Session).where(Session.id == req.session_id).values(
            prompt=final_data_to_save,
            input_source="therapist_manual"
        )
    )
    await db.commit()

    # 7. 응답 반환 (기존 로직)
    return {"session_id": req.session_id, "prompt_text": final_music_prompt}


@router.post("/find-patient", response_model=FoundPatientResponse) 
async def find_patient_by_email_or_id( 
    req: dict, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사만 이용 가능한 기능입니다.")

    search_query = req.get("query") 
    if not search_query:
        raise HTTPException(status_code=400, detail="검색어(이메일 또는 ID)를 입력해주세요.")

    patient_id: Optional[int] = None
    try:
        patient_id = int(search_query)
    except (ValueError, TypeError):
        pass 

    if patient_id is not None:
        q_patient = select(User).where(User.id == patient_id, User.role == "patient")
    else:
        q_patient = select(User).where(User.email == search_query, User.role == "patient")
        
    patient = (await db.execute(q_patient)).scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=404, detail="해당 조건의 환자 사용자를 찾을 수 없습니다.")

    # 연결 상태 확인
    connection_status = "available" 
    if patient.id == current_user.id:
        connection_status = "connected_to_self" # (이 케이스는 발생하면 안 됨)
    else:
        q_conn = select(Connection).where(
            (Connection.therapist_id == current_user.id) & (Connection.patient_id == patient.id)
        )
        existing_connection = (await db.execute(q_conn)).scalar_one_or_none()
        if existing_connection:
            if existing_connection.status == "PENDING":
                connection_status = "pending"
            elif existing_connection.status == "ACCEPTED":
                connection_status = "connected_to_self" # (자신에게 연결됨)
    
    return FoundPatientResponse(
        id=patient.id,
        name=patient.name or "이름 없음",
        email=patient.email,
        connection_status=connection_status
    )


@router.post("/request-connection", status_code=status.HTTP_201_CREATED)
async def request_connection_to_patient(
    req: dict, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사만 이용 가능한 기능입니다.")

    patient_id = req.get("patient_id")
    if not patient_id:
        raise HTTPException(status_code=400, detail="환자 ID가 필요합니다.")
    
    new_conn_stmt = insert(Connection).values(
        therapist_id=current_user.id,
        patient_id=patient_id,
        status="PENDING"
    )
    try:
        await db.execute(new_conn_stmt)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"연결 요청 중 오류 발생: {e}")

    return {"message": "Connection request sent successfully."}


@router.get("/my-patients", response_model=List[UserPublic])
async def get_my_assigned_patients(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user) 
):
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사만 이용 가능한 기능입니다.")

    patient_id_query = (
        select(Connection.patient_id)
        .where(
            Connection.therapist_id == current_user.id,
            Connection.status == "ACCEPTED"
        )
    )
    result = await db.execute(patient_id_query)
    patient_ids = result.scalars().all()

    if not patient_ids:
        return []

    patients_query = (
        select(User)
        .where(
            User.id.in_(patient_ids),
            User.role == "patient"
        )
    )
    patients_result = await db.execute(patients_query)
    patients = patients_result.scalars().all()
    
    return patients


@router.get("/patient/{patient_id}", response_model=UserPublic)
async def get_patient_details_by_counselor(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사 전용 기능입니다.")
    await check_counselor_patient_access(patient_id, current_user.id, db)
    patient = await db.get(User, patient_id)
    if not patient or patient.role != "patient":
        raise HTTPException(status_code=404, detail="환자 정보를 찾을 수 없습니다.")
    return patient


@router.get("/patient/{patient_id}/sessions", response_model=List[SessionInfo])
async def get_patient_sessions_by_counselor(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사 전용 기능입니다.")
    await check_counselor_patient_access(patient_id, current_user.id, db)
    
    query = (
        select(Session)
        .join(SessionPatientIntake, Session.id == SessionPatientIntake.session_id) 
        .where(
            Session.created_by == patient_id,
            SessionPatientIntake.has_dialog == True # 대화가 있는 세션만
        )
        .order_by(Session.created_at.desc())
    )
    result = await db.execute(query)
    sessions = result.scalars().all()
    return sessions


@router.get("/patient/{patient_id}/music", response_model=List[MusicTrackInfo])
async def get_patient_music_by_counselor(
    patient_id: int,
    limit: int | None = Query(None, ge=1), 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사 전용 기능입니다.")
    await check_counselor_patient_access(patient_id, current_user.id, db)
    
    query = (
        select(Track)
        .options(joinedload(Track.session))
        .join(Session, Track.session_id == Session.id)
        .where(Session.created_by == patient_id) 
        .order_by(Track.created_at.desc())
    )
    if limit is not None:
        query = query.limit(limit)
        
    result = await db.execute(query)
    tracks = result.scalars().unique().all()
    
    response_tracks = []
    for track in tracks:
        session_prompt_data = track.session.prompt or {}
        session_prompt_text = "프롬프트 정보 없음"
        if isinstance(session_prompt_data, dict) and "text" in session_prompt_data:
            value = session_prompt_data["text"]
            if isinstance(value, str):
                session_prompt_text = value
            else:
                session_prompt_text = "프롬프트 형식 오류"
        elif session_prompt_data is not None:
             session_prompt_text = "프롬프트 형식 오류 (DB)"
             
        response_tracks.append(MusicTrackInfo(
            id=track.id,
            title=f"AI 생성 트랙 (세션 {track.session_id})",
            prompt=session_prompt_text,
            track_url=track.track_url
        ))
    return response_tracks


@router.get("/stats", response_model=CounselorStats)
async def get_counselor_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사 전용 기능입니다.")

    patient_id_q = select(Connection.patient_id).where(
        Connection.therapist_id == current_user.id,
        Connection.status == "ACCEPTED"
    )
    patient_ids_result = await db.execute(patient_id_q)
    patient_ids = patient_ids_result.scalars().all()

    total_patients = len(patient_ids)
    total_music = 0

    if patient_ids:
        music_count_q = select(func.count(Track.id)).join(
            Session, Track.session_id == Session.id
        ).where(
            Session.created_by.in_(patient_ids)
        )
        music_count_result = await db.execute(music_count_q)
        total_music = music_count_result.scalar_one()

    return CounselorStats(total_patients=total_patients, total_music_tracks=total_music)


@router.get("/recent-music", response_model=List[RecentMusicTrack])
async def get_recent_music_for_counselor(
    limit: int = Query(3, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사만 이용 가능한 기능입니다.")

    patient_id_q = select(Connection.patient_id).where(
        Connection.therapist_id == current_user.id,
        Connection.status == "ACCEPTED"
    )
    patient_ids_result = await db.execute(patient_id_q)
    patient_ids = patient_ids_result.scalars().all()

    if not patient_ids:
        return []

    tracks_q = (
        select(Track)
        .join(Session, Track.session_id == Session.id)
        .join(User, Session.created_by == User.id)
        .options(
            joinedload(Track.session).joinedload(Session.creator)
        )
        .where(Session.created_by.in_(patient_ids))
        .order_by(Track.created_at.desc())
        .limit(limit)
    )
    tracks_result = await db.execute(tracks_q)
    tracks = tracks_result.scalars().unique().all()
    
    response_tracks = []
    for track in tracks:
        session_prompt_data = track.session.prompt or {}
        session_prompt_text = "프롬프트 정보 없음"
        if isinstance(session_prompt_data, dict) and "text" in session_prompt_data:
             value = session_prompt_data["text"]
             if isinstance(value, str): session_prompt_text = value
             else: session_prompt_text = "프롬프트 형식 오류"

        response_tracks.append(RecentMusicTrack(
            music_id=track.id,
            music_title=f"AI 트랙 (세션 {track.session_id})",
            patient_id=track.session.created_by,
            patient_name=track.session.creator.name or track.session.creator.email
        ))
    return response_tracks