# backend/routers/sessions.py
from fastapi import APIRouter, Depends
from backend.app.api.auth_dep import get_current_user, User
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.db import get_db
from backend.app.models import Patient, Session

router = APIRouter(prefix="/sessions", tags=["sessions"])

@router.post("/start/{patient_code}")
async def start_session(patient_code: str, db: AsyncSession = Depends(get_db)):
    # 환자 없으면 생성
    res = await db.execute(select(Patient).where(Patient.code == patient_code))
    patient = res.scalar_one_or_none()
    if not patient:
        patient = Patient(code=patient_code)
        db.add(patient)
        await db.flush()  # id 확보

    sess = Session(patient_id=patient.id, target_metric={"anxiety":4})
    db.add(sess)
    await db.commit()
    await db.refresh(sess)
    return {"session_id": sess.id}

@router.get("/")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Session).order_by(Session.id.desc()).limit(20))
    return [ {"id": s.id, "patient_id": s.patient_id, "target": s.target_metric} for s in res.scalars() ]
