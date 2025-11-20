from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import insert, update, select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional # 💡 Optional 추가
from app.models import User, Session, TherapistManualInputs, SessionPrompt, Connection, Track, SessionPatientIntake, CounselorNote
from app.services.auth_service import get_current_user
from app.schemas import (
    TherapistPromptReq, SessionCreateResp, PromptResp, TherapistManualInput, 
    FoundPatientResponse, UserPublic, SessionInfo, MusicTrackInfo,
    CounselorStats, RecentMusicTrack, PatientInfoWithStats, NoteCreate, NotePublic, NoteUpdate
)
from app.db import get_db
from sqlalchemy.orm import joinedload, selectinload
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
# 💡 [핵심 수정] 수동 프롬프트 생성 (SQL 오류 방지 로직 추가)
@router.post("/manual-generate", response_model=PromptResp)
async def manual_generate(
    req: TherapistPromptReq,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = await db.get(Session, req.session_id) 
    if not session or not session.created_by:
        raise HTTPException(status_code=404, detail=f"Session not found.")

    # 1. 권한 검사
    if current_user.role == "patient":
        if session.created_by != current_user.id:
            raise HTTPException(status_code=403, detail="권한이 없습니다.")
    elif current_user.role == "therapist":
        try:
            await check_counselor_patient_access(session.created_by, current_user.id, db)
        except HTTPException:
            if session.created_by != current_user.id:
                raise HTTPException(status_code=403, detail="권한이 없습니다.")
    else:
         raise HTTPException(status_code=403, detail="권한이 없습니다.")

    # 💡 2. 데이터 분리 저장 (핵심!)
    
    # (A) 전체 데이터 (VAS 포함) -> JSON 로그용
    full_manual_data = req.manual.model_dump()
    
    # (B) SQL 데이터 (VAS 제거) -> DB 테이블용
    # models.py를 수정하지 않았으므로, 테이블에 없는 컬럼을 넣으면 에러가 납니다.
    sql_manual_data = full_manual_data.copy()
    for key in ['anxiety', 'depression', 'pain']:
        sql_manual_data.pop(key, None) # 안전하게 제거

    # 기존 데이터 삭제 (중복 방지)
    await db.execute(delete(TherapistManualInputs).where(TherapistManualInputs.session_id == req.session_id))
    
    # DB 모델 생성 및 저장 (SQL용 데이터 사용)
    manual_db = TherapistManualInputs(
        session_id=req.session_id,
        **sql_manual_data # 👈 여기에 VAS 점수가 없어야 에러가 안 남
    )
    db.add(manual_db)
    
    # 스냅샷 저장 (전체 데이터 사용 - 여기에 VAS가 보존됨)
    await db.execute(
        insert(SessionPrompt).values(
            session_id=req.session_id, stage="manual", data=full_manual_data
        )
    )
    await db.commit() # 💡 커밋

    # 3. AI 호출 준비
    extra = build_extra_requirements_for_therapist(full_manual_data)

    # 4. OpenAI 호출
    prompt_dict = await generate_prompt_from_guideline(req.guideline_json, extra)

    # 5. 결과 저장
    final_music_prompt = prompt_dict.get("music_prompt", "기본 프롬프트")
    final_lyrics = prompt_dict.get("lyrics_text", "")
    
    final_data = {
        "text": final_music_prompt,
        "music_prompt": final_music_prompt,
        "lyrics_text": final_lyrics
    }
    
    await db.execute(
        insert(SessionPrompt).values(session_id=req.session_id, stage="final", data=final_data)
    )
    await db.execute(
        update(Session).where(Session.id == req.session_id).values(
            prompt=final_data,
            input_source="therapist_manual"
        )
    )
    await db.commit()

    return {"session_id": req.session_id, "prompt_text": final_music_prompt, "lyrics_text": final_lyrics}

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


@router.get("/my-patients", response_model=List[PatientInfoWithStats])
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
        .options(
            # 💡 [수정] User.sessions (models.py의 관계 이름) 로드
            selectinload(User.sessions).options(
                selectinload(Session.tracks),           # 👈 세션의 트랙 목록
                joinedload(Session.patient_intake)  # 👈 세션의 Intake 정보 (has_dialog)
            ) 
        )
    )
    patients_result = await db.execute(patients_query)
    patients = patients_result.scalars().unique().all()

    # 3. 💡 [수정] 통계 정보를 계산하여 새 스키마로 변환
    response_data = []
    for patient in patients:
        
        # 💡 [핵심!] has_dialog가 True인 세션만 필터링하여 개수 계산
        counseling_sessions = [
            s for s in patient.sessions 
            if s.patient_intake and s.patient_intake.has_dialog
        ]
        total_sessions = len(counseling_sessions) # 👈 [수정] 정확한 상담 횟수

        # 💡 총 생성 음악 (이전과 동일 - 모든 세션의 트랙 합산)
        total_music_tracks = sum(len(session.tracks) for session in patient.sessions)
        
        response_data.append(PatientInfoWithStats(
            id=patient.id,
            name=patient.name,
            email=patient.email,
            role=patient.role,
            age=patient.age,
            kakao_id=patient.kakao_id,
            social_provider=patient.social_provider,
            total_sessions=total_sessions, # 👈 수정된 값
            total_music_tracks=total_music_tracks
        ))

    return response_data


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
        # 💡 [수정] Session 및 SessionPatientIntake 정보 함께 로드
        .options(
            joinedload(Track.session).options(
                joinedload(Session.patient_intake)
            )
        )
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
            joinedload(Track.session).options(
                joinedload(Session.creator), # 👈 환자 정보
                joinedload(Session.patient_intake) # 👈 대화 유무
            )
        )
        .where(Session.created_by.in_(patient_ids))
        .order_by(Track.created_at.desc())
        .limit(limit)
    )
    tracks_result = await db.execute(tracks_q)
    tracks = tracks_result.scalars().unique().all()
    
    response_tracks = []
    for track in tracks:
        session = track.session
        intake = session.patient_intake
        
        # 💡 [수정] 동적 제목 생성
        title = f"AI 트랙 (세션 {track.session_id})" # 기본값
        if session.initiator_type == "therapist":
            title = f"상담사 처방 음악"
        elif session.initiator_type == "patient":
            if intake and intake.has_dialog:
                title = f"AI 상담 기반 음악"
            else:
                title = f"작곡 체험 음악"

        response_tracks.append(RecentMusicTrack(
            music_id=track.id,
            music_title=title, # 👈 동적 제목
            patient_id=track.session.created_by,
            patient_name=track.session.creator.name or track.session.creator.email,
            
            session_id=session.id, # 👈 세션 ID
            initiator_type=session.initiator_type, # 👈 세션 타입
            has_dialog=intake.has_dialog if intake else False, # 👈 대화 유무
            created_at=track.created_at,
            is_favorite=track.is_favorite
        ))
    return response_tracks

@router.get("/patient/{patient_id}/notes", response_model=List[NotePublic])
async def get_counselor_notes_for_patient(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """(수정됨) 이 환자를 담당하는 '모든' 상담사가 작성한 메모를 조회합니다."""
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사 전용 기능입니다.")
    
    # (환자 접근 권한 확인 - 이 상담사가 이 환자를 볼 권한이 있는가?)
    await check_counselor_patient_access(patient_id, current_user.id, db)
    
    # 💡 [핵심 수정] models.py를 건드리지 않고 수동으로 JOIN
    query = (
        select(
            CounselorNote, # 👈 CounselorNote 객체
            User.name.label("therapist_name") # 👈 User 테이블의 name
        )
        .join(User, CounselorNote.therapist_id == User.id) # 👈 수동 JOIN
        .where(
            CounselorNote.patient_id == patient_id
            # 💡 [삭제] therapist_id == current_user.id (본인 메모 필터) 삭제!
        )
        .order_by(CounselorNote.created_at.desc()) # 최신순
    )
    
    result = await db.execute(query)
    rows = result.all() # 👈 .all()로 (Note, name) 튜플을 가져옴

    # 💡 [수정] 스키마에 therapist_name 매핑
    response_notes = []
    for note, therapist_name in rows: # 👈 (note, therapist_name) 튜플
        response_notes.append(NotePublic(
            id=note.id,
            patient_id=note.patient_id,
            therapist_id=note.therapist_id,
            content=note.content,
            created_at=note.created_at,
            updated_at=note.updated_at,
            therapist_name=therapist_name or "알 수 없음" # 👈 JOIN한 이름 사용
        ))

    return response_notes

# 💡 3. (POST) 특정 환자에 대한 메모 생성 (작성자 이름 반환)
@router.post("/patient/{patient_id}/notes", response_model=NotePublic, status_code=status.HTTP_201_CREATED)
async def create_counselor_note_for_patient(
    patient_id: int,
    note_in: NoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """(수정됨) 특정 환자에 대한 새 메모를 생성하고, 작성자 이름을 포함하여 반환합니다."""
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사 전용 기능입니다.")
    
    await check_counselor_patient_access(patient_id, current_user.id, db)
    
    new_note = CounselorNote(
        patient_id=patient_id,
        therapist_id=current_user.id, # 👈 작성자는 current_user
        content=note_in.content
    )
    
    try:
        db.add(new_note)
        await db.commit()
        await db.refresh(new_note)
        
        # 💡 [수정] 반환 시 therapist_name을 채우기 위해 current_user 정보 사용
        return NotePublic(
            id=new_note.id,
            patient_id=new_note.patient_id,
            therapist_id=new_note.therapist_id,
            content=new_note.content,
            created_at=new_note.created_at,
            updated_at=new_note.updated_at,
            therapist_name=current_user.name or current_user.email # 👈 본인 이름 추가
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, f"메모 저장 실패: {e}")

# 💡 4. (DELETE) 특정 메모 삭제 (변경 없음 - 본인만 삭제 가능)
@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_counselor_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """(신규) 상담사 본인이 작성한 메모를 삭제합니다."""
    if current_user.role != "therapist":
        raise HTTPException(status_code=403, detail="상담사 전용 기능입니다.")
        
    note = await db.get(CounselorNote, note_id)
    
    if not note:
        raise HTTPException(status_code=404, detail="메모를 찾을 수 없습니다.")
        
    # (보안: 본인이 쓴 메모만 삭제 가능)
    if note.therapist_id != current_user.id:
        raise HTTPException(status_code=403, detail="이 메모를 삭제할 권한이 없습니다.")
        
    try:
        await db.delete(note)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, f"메모 삭제 실패: {e}")
    
    return None