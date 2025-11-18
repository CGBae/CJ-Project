# backend/routers/sessions.py
from fastapi import APIRouter, Depends
from app.api.deps import get_current_user
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_db
from app.models import Session, User, SessionPatientIntake
from typing import List
from app.schemas import SessionInfo
from sqlalchemy.orm import joinedload

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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user) # 현재 로그인 사용자
):
    """현재 로그인한 사용자가 생성한 모든 상담 세션 목록을 반환합니다."""
    query = (
        select(Session)
        # 💡 3. SessionPatientIntake 테이블을 조인합니다.
        .join(SessionPatientIntake, Session.id == SessionPatientIntake.session_id)
        # 💡 4. created_by 와 has_dialog == True 조건으로 필터링합니다.
        .where(
            Session.created_by == current_user.id,
            SessionPatientIntake.has_dialog == True # 👈 실제 대화가 시작된 세션만!
        )
        .order_by(Session.created_at.desc())
        # 💡 5. (선택적) N+1 방지를 위해 patient_intake 정보도 미리 로드
        .options(joinedload(Session.patient_intake))
    )
    result = await db.execute(query)
    # 💡 6. unique() 추가 (joinedload 사용 시)
    sessions = result.scalars().unique().all()
    return sessions # SessionInfo 스키마에 맞춰 자동 변환됨

@router.get("/")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Session).order_by(Session.id.desc()).limit(20))
    return [ {"id": s.id, "patient_id": s.patient_id, "target": s.target_metric} for s in res.scalars() ]
