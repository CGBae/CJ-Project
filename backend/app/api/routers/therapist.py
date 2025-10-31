from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status,Query
from sqlalchemy import insert, update, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.models import User, Session, TherapistManualInputs, SessionPrompt, Connection, Track, SessionPatientIntake
from app.services.auth_service import get_current_user
from app.schemas import (
    TherapistPromptReq, SessionCreateResp, PromptResp, TherapistManualInput, 
    FoundPatientResponse, UserPublic, SessionInfo, MusicTrackInfo,
    CounselorStats, RecentMusicTrack # 👈 여기 추가
)
from app.db import get_db
from sqlalchemy.orm import joinedload
from app.services.openai_client import generate_prompt_from_guideline
from app.services.prompt_from_guideline import build_extra_requirements_for_therapist

router = APIRouter(prefix="/therapist", tags=["therapist"])

@router.post("/new", response_model=SessionCreateResp)
async def create_session(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user) 
):
    if current_user.role != "therapist":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only therapists can create this type of session."
        )
        
    res = await db.execute(
        insert(Session)
        .values(
            initiator_type="therapist", 
            status="QUEUED",
            created_by=current_user.id
        ).returning(Session.id)
    )
    session_id = res.scalar_one()
    await db.commit()
    return {"session_id": session_id, "status": "QUEUED"}

@router.post("/manual-generate", response_model=PromptResp)
async def manual_generate(
    req: TherapistPromptReq,
    db: AsyncSession = Depends(get_db),
    # 💡 [핵심 추가] 인증된 사용자만 호출하도록 추가
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "therapist":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires therapist privileges."
        )

    # 💡 [보안 수정 3] 세션 소유권 검사
    # db.get()을 사용하여 Primary Key로 세션을 효율적으로 조회
    session = await db.get(Session, req.session_id) 

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session (ID: {req.session_id}) not found."
        )
    
    if session.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this session."
        )
        
    # manual 입력 upsert (단순화를 위해 insert on conflict 대신 delete/insert 또는 update)
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

    # 상담사용 '추가 요구사항' 텍스트 구성
    extra = build_extra_requirements_for_therapist(req.manual.model_dump())

    # OpenAI 호출: 긴 가이드라인 그대로 + 추가요구사항 텍스트
    prompt_dict = await generate_prompt_from_guideline(req.guideline_json, extra)

    # --- DB 저장 로직 (이전 답변과 동일, 올바른 코드) ---
    # 1. 실제 음악 프롬프트 문자열 추출
    final_music_prompt = prompt_dict.get("music_prompt", "기본 프롬프트: 잔잔한 음악")
    # 2. 가사 문자열 추출
    final_lyrics = prompt_dict.get("lyrics_text", "")
    # 3. DB에 저장할 최종 데이터 구성
    final_data_to_save = {
        "text": final_music_prompt,
        "music_prompt": final_music_prompt,
        "lyrics_text": final_lyrics
    }
    # 4. final 스냅샷 저장
    await db.execute(
        insert(SessionPrompt).values(session_id=req.session_id, stage="final", data=final_data_to_save)
    )
    # 5. 세션 업데이트
    await db.execute(
        update(Session).where(Session.id == req.session_id).values(
            prompt=final_data_to_save,
            input_source="therapist_manual"
        )
    )
    await db.commit()
    # --- DB 저장 로직 끝 ---

    # 응답 반환 부분 (이전 답변과 동일, 올바른 코드)
    return {"session_id": req.session_id, "prompt_text": final_music_prompt}

@router.post("/find-patient", response_model=FoundPatientResponse) 
async def find_patient_by_email(
    req: dict, # 간단히 dict로 처리 (또는 Pydantic 모델 정의)
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    상담사가 이메일로 환자를 검색합니다.
    """
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사만 이용 가능한 기능입니다.")

    patient_email = req.get("email")
    if not patient_email:
        raise HTTPException(status_code=400, detail="이메일을 입력해주세요.")

    # 1. 이메일로 사용자 검색 (역할이 'patient'인 사용자)
    q_patient = select(User).where(
        User.email == patient_email,
        User.role == "patient"
    )
    patient = (await db.execute(q_patient)).scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=404, detail="해당 이메일을 가진 환자 사용자를 찾을 수 없습니다.")

    # 2. 연결 상태 확인
    connection_status = "available" # 기본값

    if patient.id == current_user.id:
        connection_status = "connected_to_self"
    else:
        q_conn = select(Connection).where(
            (Connection.therapist_id == current_user.id) & (Connection.patient_id == patient.id)
        )
        existing_connection = (await db.execute(q_conn)).scalar_one_or_none()
        
        if existing_connection:
            if existing_connection.status == "PENDING":
                connection_status = "pending"
            elif existing_connection.status == "ACCEPTED":
                connection_status = "connected_to_other" # 이미 연결된 상태 (이름 수정 필요)
        
    return FoundPatientResponse(
        id=patient.id,
        name=patient.name or "이름 없음",
        email=patient.email,
        connection_status=connection_status
    )

# 💡 [추가 2] 연결 요청 엔드포인트
@router.post("/request-connection", status_code=status.HTTP_201_CREATED)
async def request_connection_to_patient(
    req: dict, # Pydantic 모델 정의 권장
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    상담사가 환자에게 연결을 요청합니다. (Connection 생성)
    """
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사만 이용 가능한 기능입니다.")

    patient_id = req.get("patient_id")
    if not patient_id:
        raise HTTPException(status_code=400, detail="환자 ID가 필요합니다.")

    # (여기서 이미 연결된 상태인지, 환자가 존재하는지 등 유효성 검사 필요)
    
    # Connection 테이블에 PENDING 상태로 삽입
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
        # (이미 존재하는 연결일 경우 예외 처리 등 필요)
        raise HTTPException(status_code=500, detail=f"연결 요청 중 오류 발생: {e}")

    return {"message": "Connection request sent successfully."}

# 💡 3. [핵심 API 추가] "내 환자 목록" 조회
@router.get("/my-patients", response_model=List[UserPublic])
async def get_my_assigned_patients(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user) # 현재 로그인한 상담사
):
    """(신규) 현재 로그인한 상담사에게 '수락(ACCEPTED)'된 환자 목록을 반환합니다."""
    
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사만 이용 가능한 기능입니다.")

    # 1. 'Connection' 테이블에서 현재 상담사와 'ACCEPTED' 상태인 환자 ID 목록 조회
    patient_id_query = (
        select(Connection.patient_id)
        .where(
            Connection.therapist_id == current_user.id,
            Connection.status == "ACCEPTED" # 👈 수락된 환자만
        )
    )
    result = await db.execute(patient_id_query)
    patient_ids = result.scalars().all()

    if not patient_ids:
        return [] # 배정된 환자가 없으면 빈 리스트 반환

    # 2. 찾은 환자 ID 목록으로 'User' 테이블에서 환자 정보 조회
    patients_query = (
        select(User)
        .where(
            User.id.in_(patient_ids),
            User.role == "patient" # 역할이 환자인지 확인
        )
    )
    patients_result = await db.execute(patients_query)
    patients = patients_result.scalars().all()
    
    return patients # UserPublic 스키마(id, name, email, role 등) 리스트 반환

# --- 💡 4. [핵심 API 1] 상담사가 특정 환자 정보 조회 ---
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

@router.get("/patient/{patient_id}", response_model=UserPublic)
async def get_patient_details_by_counselor(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상담사가 자신에게 배정된 특정 환자의 기본 정보를 조회합니다."""
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사 전용 기능입니다.")
        
    # 1. 이 환자에게 접근 권한이 있는지 확인
    await check_counselor_patient_access(patient_id, current_user.id, db)
    
    # 2. 환자 정보 조회
    patient = await db.get(User, patient_id)
    if not patient or patient.role != "patient":
        raise HTTPException(status_code=404, detail="환자 정보를 찾을 수 없습니다.")
        
    return patient

# --- 💡 5. [핵심 API 2] 상담사가 특정 환자의 세션 목록 조회 ---
@router.get("/patient/{patient_id}/sessions", response_model=List[SessionInfo])
async def get_patient_sessions_by_counselor(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상담사가 특정 환자의 '대화가 있는' 세션 목록을 조회합니다."""
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사 전용 기능입니다.")
    
    await check_counselor_patient_access(patient_id, current_user.id, db)
    
    query = (
        select(Session)
        .join(SessionPatientIntake, Session.id == SessionPatientIntake.session_id)
        .where(
            Session.created_by == patient_id, # 환자가 생성한 세션
            SessionPatientIntake.has_dialog == True # 대화가 있는 세션만
        )
        .order_by(Session.created_at.desc())
    )
    result = await db.execute(query)
    sessions = result.scalars().all()
    return sessions

# --- 💡 6. [핵심 API 3] 상담사가 특정 환자의 음악 목록 조회 ---
@router.get("/patient/{patient_id}/music", response_model=List[MusicTrackInfo])
async def get_patient_music_by_counselor(
    patient_id: int,
    limit: int | None = Query(None, ge=1), # limit 없이 전체 조회
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """상담사가 특정 환자의 전체 음악 목록을 조회합니다."""
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사 전용 기능입니다.")
        
    await check_counselor_patient_access(patient_id, current_user.id, db)
    
    query = (
        select(Track)
        .options(joinedload(Track.session))
        .join(Session, Track.session_id == Session.id)
        .where(Session.created_by == patient_id) # 환자가 생성한 세션의 트랙
        .order_by(Track.created_at.desc())
    )
    if limit is not None:
        query = query.limit(limit)
        
    result = await db.execute(query)
    tracks = result.scalars().unique().all()
    
    # (music.py의 /my API와 동일한 로직으로 MusicTrackInfo 생성)
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

# --- 💡 [핵심 API 추가 1] 상담사 통계 ---
@router.get("/stats", response_model=CounselorStats)
async def get_counselor_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """(신규) 현재 상담사의 통계 (담당 환자 수, 총 음악 수)를 반환합니다."""
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사 전용 기능입니다.")

    # 1. 담당 환자 ID 목록 조회
    patient_id_q = select(Connection.patient_id).where(
        Connection.therapist_id == current_user.id,
        Connection.status == "ACCEPTED"
    )
    patient_ids_result = await db.execute(patient_id_q)
    patient_ids = patient_ids_result.scalars().all()

    total_patients = len(patient_ids)
    total_music = 0

    if patient_ids:
        # 2. 환자 ID 목록을 기반으로 생성된 음악(Track) 수 계산
        music_count_q = select(func.count(Track.id)).join(
            Session, Track.session_id == Session.id
        ).where(
            Session.created_by.in_(patient_ids) # 👈 환자들이 생성한 세션에 속한 트랙
        )
        music_count_result = await db.execute(music_count_q)
        total_music = music_count_result.scalar_one()

    return CounselorStats(total_patients=total_patients, total_music_tracks=total_music)


# --- 💡 [핵심 API 추가 2] 상담사 대시보드용 최근 음악 ---
@router.get("/recent-music", response_model=List[RecentMusicTrack])
async def get_recent_music_for_counselor(
    limit: int = Query(3, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """(신규) 현재 상담사에게 배정된 환자들이 생성한 음악 트랙 목록을 최신순으로 반환합니다."""
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사 전용 기능입니다.")

    # 1. 담당 환자 ID 목록 조회
    patient_id_q = select(Connection.patient_id).where(
        Connection.therapist_id == current_user.id,
        Connection.status == "ACCEPTED"
    )
    patient_ids_result = await db.execute(patient_id_q)
    patient_ids = patient_ids_result.scalars().all()

    if not patient_ids:
        return [] # 환자가 없으면 빈 리스트 반환

    # 2. 환자 ID로 최근 트랙 조회 (세션 및 생성자(User) 정보 포함)
    tracks_q = (
        select(Track)
        .join(Session, Track.session_id == Session.id)
        .join(User, Session.created_by == User.id) # 👈 환자 정보(User) 조인
        .options(
            joinedload(Track.session).joinedload(Session.creator) # 👈 Session.creator (User) 정보 미리 로드
        )
        .where(Session.created_by.in_(patient_ids))
        .order_by(Track.created_at.desc())
        .limit(limit)
    )
    tracks_result = await db.execute(tracks_q)
    tracks = tracks_result.scalars().unique().all()
    
    # 3. 프론트엔드 형식(RecentMusicTrack)에 맞게 데이터 가공
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
            music_title=f"AI 트랙 (세션 {track.session_id})", # (프롬프트에서 제목 추출 필요시 로직 추가)
            patient_id=track.session.created_by,
            patient_name=track.session.creator.name or track.session.creator.email
        ))
    return response_tracks