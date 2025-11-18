# backend/routers/sessions.py
from fastapi import APIRouter, Depends
from app.api.deps import get_current_user
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_db
from app.models import Session, ConversationMessage, SessionPatientIntake, User
from typing import List
from app.schemas import SessionInfo
from sqlalchemy.orm import selectinload, joinedload

router = APIRouter(prefix="/sessions", tags=["sessions"])

# @router.post("/start/{patient_code}")
# async def start_session(patient_code: str, db: AsyncSession = Depends(get_db)):
#     # 환자 없으면 생성
#     res = await db.execute(select(Patient).where(Patient.code == patient_code))
#     patient = res.scalar_one_or_none()
#     if not patient:
#         patient = Patient(code=patient_code)
#         db.add(patient)
#         await db.flush()  # id 확보

#     sess = Session(patient_id=patient.id, target_metric={"anxiety":4})
#     db.add(sess)
#     await db.commit()
#     await db.refresh(sess)
#     return {"session_id": sess.id}

@router.get("/my", response_model=List[SessionInfo])
async def get_my_sessions(
    has_dialog: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user) # 현재 로그인 사용자
):
    """(수정됨) 현재 로그인한 환자의 모든 세션 기록을 반환합니다."""
    
    query = (
        select(Session)
        .where(Session.created_by == current_user.id)
        .options(
            # 💡 [핵심 추가] SessionPatientIntake 테이블을 JOIN(Eager Loading)합니다.
            # 이것이 누락되면 has_dialog가 항상 null이 됩니다.
            joinedload(Session.patient_intake) 
        )
        .order_by(Session.created_at.desc())
    )

    # 💡 [추가] /counsel 페이지가 'AI 상담' 목록만 요청할 경우
    if has_dialog is not None:
        # SessionPatientIntake가 JOIN되었으므로, 해당 테이블의 has_dialog로 필터링
        query = query.join(Session.patient_intake).where(
            SessionPatientIntake.has_dialog == has_dialog
        )
        
    result = await db.execute(query)
    sessions = result.scalars().unique().all() # 👈 [추가] unique()

    # 💡 [수정] SessionInfo 스키마로 변환
    response_sessions = []
    for session in sessions:
        response_sessions.append(SessionInfo(
            id=session.id,
            created_at=session.created_at,
            initiator_type=session.initiator_type,
            # 💡 patient_intake가 로드되었으므로 has_dialog 값을 올바르게 채움
            has_dialog=session.patient_intake.has_dialog if session.patient_intake else False
        ))

    return response_sessions

# 💡 5. (참고) /sessions/my/{session_id} API (이 API는 사용되지 않는 듯함)
@router.get("/my/{session_id}")
async def get_my_session_details(session_id: int):
    # (이 API는 현재 대시보드와 관련 없음)
    return {"session_id": session_id, "detail": "Not implemented"}