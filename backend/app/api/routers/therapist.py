from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import insert, update, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User, Session, TherapistManualInputs, SessionPrompt, Connection
from app.services.auth_service import get_current_user
from app.schemas import TherapistPromptReq, SessionCreateResp, PromptResp, TherapistManualInput, FoundPatientResponse
from app.db import get_db
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