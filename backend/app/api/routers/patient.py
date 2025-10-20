from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import insert, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import PatientIntake, PatientAnalyzeReq, SessionCreateResp, PromptResp
from app.models import Session, SessionPatientIntake, ConversationMessage, SessionPrompt
from app.db import get_db
from app.services.openai_client import generate_prompt_from_guideline
from app.services.prompt_from_guideline import build_extra_requirements_for_patient

router = APIRouter(prefix="/patient", tags=["patient"])

@router.post("/intake", response_model=SessionCreateResp)
async def create_patient_session(payload: PatientIntake, db: AsyncSession = Depends(get_db)):
    # 1) 세션 생성
    res = await db.execute(
        insert(Session).values(initiator_type="patient", status="QUEUED").returning(Session.id)
    )
    session_id = res.scalar_one()

    # 2) 인테이크 저장
    await db.execute(
        insert(SessionPatientIntake).values(
            session_id=session_id,
            vas=payload.vas, prefs=payload.prefs, goal=payload.goal,
            has_dialog=bool(payload.dialog)
        )
    )

    # 3) 대화 저장(있으면)
    if payload.dialog:
        msgs = [
            {"session_id": session_id, "role": m["role"], "content": m["content"]}
            for m in payload.dialog
        ]
        await db.execute(insert(ConversationMessage).values(msgs))

    # 4) user_input 스냅샷
    await db.execute(
        insert(SessionPrompt).values(
            session_id=session_id, stage="user_input",
            data={"vas": payload.vas, "prefs": payload.prefs, "goal": payload.goal}
        )
    )
    await db.commit()
    return {"session_id": session_id, "status": "QUEUED"}


@router.post("/analyze-and-generate", response_model=PromptResp)
async def analyze_and_generate(req: PatientAnalyzeReq, db: AsyncSession = Depends(get_db)):
    # 간단화: 대화 요약/키워드는 여기선 생략하고, 인테이크 기반 + '분석무드:calming' 가정
    # 실제로는 OpenAI에 먼저 대화 분석 요청 후, 그 결과를 analyzed에 채워 넣으세요.
    # analyzed = await call_openai_analyze_dialog(...)

    # 인테이크 로드
    s_intake = await db.get(SessionPatientIntake, req.session_id)
    if not s_intake:
        raise HTTPException(404, "session intake not found")

    analyzed = {"mood": "calming", "keywords": [], "target": s_intake.goal, "confidence": 0.7}

    # analyzed 스냅샷
    await db.execute(
        insert(SessionPrompt).values(
            session_id=req.session_id, stage="analyzed", data=analyzed, confidence=0.7
        )
    )

    # 환자 흐름용 '추가 요구사항' 텍스트 구성
    extra = build_extra_requirements_for_patient(s_intake.vas, s_intake.prefs, s_intake.goal, analyzed)

    # OpenAI 호출: 긴 가이드라인 그대로 + 추가요구사항 텍스트
    prompt_text = await generate_prompt_from_guideline(req.guideline_json, extra)

    # final 스냅샷 + 세션 업데이트
    await db.execute(
        insert(SessionPrompt).values(session_id=req.session_id, stage="final", data={"text": prompt_text})
    )
    await db.execute(
        update(Session).where(Session.id == req.session_id).values(
            prompt={"text": prompt_text},
            input_source="patient_analyzed"
        )
    )
    await db.commit()
    return {"session_id": req.session_id, "prompt_text": prompt_text}
