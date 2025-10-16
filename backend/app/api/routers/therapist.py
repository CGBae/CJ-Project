from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import insert, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import TherapistPromptReq, SessionCreateResp, PromptResp, TherapistManualInput
from app.models import Session, TherapistManualInputs, SessionPrompt
from app.db import get_db
from app.services.openai_client import generate_prompt_from_guideline
from app.services.prompt_from_guideline import build_extra_requirements_for_therapist

router = APIRouter(prefix="/therapist", tags=["therapist"])

@router.post("/new", response_model=SessionCreateResp)
async def create_session(db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        insert(Session).values(initiator_type="therapist", status="QUEUED").returning(Session.id)
    )
    session_id = res.scalar_one()
    await db.commit()
    return {"session_id": session_id, "status": "QUEUED"}

@router.post("/manual-generate", response_model=PromptResp)
async def manual_generate(req: TherapistPromptReq, db: AsyncSession = Depends(get_db)):
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
    prompt_text = await generate_prompt_from_guideline(req.guideline_json, extra)

    # final 스냅샷 + 세션 업데이트
    await db.execute(
        insert(SessionPrompt).values(session_id=req.session_id, stage="final", data={"text": prompt_text})
    )
    await db.execute(
        update(Session).where(Session.id == req.session_id).values(
            prompt={"text": prompt_text},
            input_source="therapist_manual"
        )
    )
    await db.commit()

    return {"session_id": req.session_id, "prompt_text": prompt_text}
