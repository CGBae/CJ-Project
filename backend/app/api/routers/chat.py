from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import ConversationMessage, Session, SessionPatientIntake, TherapistManualInputs, SessionPrompt
from app.services.openai_chat import chat_complete, analyze_dialog_for_mood
from app.services.intent_detector import is_compose_request
from app.services.openai_client import generate_prompt_from_guideline
from app.services.prompt_from_guideline import (
    build_extra_requirements_for_patient,
    build_extra_requirements_for_therapist
)

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatSendReq(BaseModel):
    session_id: int
    message: str
    guideline_json: str | None = None  # 음악 생성시 필요

class ChatSendResp(BaseModel):
    assistant: str
    composed_prompt: str | None = None  # 음악 생성 트리거 시 반환

@router.post("/send", response_model=ChatSendResp)
async def chat_send(req: ChatSendReq, db: AsyncSession = Depends(get_db)):
    # 1) 세션 확인
    session = await db.get(Session, req.session_id)
    if not session:
        raise HTTPException(404, "session not found")
    
    intake = await db.get(SessionPatientIntake, req.session_id)

    # 2) 사용자 메시지 저장
    await db.execute(
        insert(ConversationMessage).values(
            session_id=req.session_id, role="user", content=req.message
        )
    )
    
    if intake and not intake.has_dialog:
        await db.execute(
            update(SessionPatientIntake)
            .where(SessionPatientIntake.session_id == req.session_id)
            .values(has_dialog=True)
        )

    # 3) 최근 히스토리 로드 (최신 순 정렬 후 뒤에서 자르기)
    q = select(ConversationMessage.role, ConversationMessage.content)\
        .where(ConversationMessage.session_id == req.session_id)\
        .order_by(ConversationMessage.created_at.asc())
    rows = (await db.execute(q)).all()
    history = [{"role": r[0], "content": r[1]} for r in rows]

    # 4) OpenAI 대화 응답 생성
    assistant_text = await chat_complete(history)

    # 5) 어시스턴트 메시지 저장
    await db.execute(
        insert(ConversationMessage).values(
            session_id=req.session_id, role="assistant", content=assistant_text
        )
    )
    await db.commit()

    # 6) 음악 생성 의도 감지
    composed_prompt = None
    if is_compose_request(req.message) or is_compose_request(assistant_text):
        if not req.guideline_json:
            # 가이드라인이 없으면 프롬프트 생성 불가 → 안내만
            return ChatSendResp(assistant=assistant_text, composed_prompt=None)

        # a) 환자 or 상담사 분기
        if session.initiator_type == "patient":
            intake = await db.get(SessionPatientIntake, req.session_id)
            # 간단 분석값(샘플): 실제로는 OpenAI로 대화 요약/키워드 뽑아 넣기
            analyzed = await analyze_dialog_for_mood(history)
            if not analyzed.get("target") and intake and intake.goal:
                 analyzed["target"] = intake.goal
                 
            extra = build_extra_requirements_for_patient(
                getattr(intake, "vas", None),
                getattr(intake, "prefs", None),
                getattr(intake, "goal", None),
                analyzed
            )
        else:
            manual = await db.get(TherapistManualInputs, req.session_id)
            if not manual:
                extra = "- 상담사 입력 없음: ambient, 70~80 BPM, 무가사, 120초로 생성"
            else:
                extra = build_extra_requirements_for_therapist({
                    "genre": manual.genre,
                    "mood": manual.mood,
                    "bpm_min": manual.bpm_min,
                    "bpm_max": manual.bpm_max,
                    "key_signature": manual.key_signature,
                    "vocals_allowed": manual.vocals_allowed,
                    "include_instruments": manual.include_instruments,
                    "exclude_instruments": manual.exclude_instruments,
                    "duration_sec": manual.duration_sec,
                    "notes": manual.notes
                })

        # b) 가이드라인 + 추가 요구사항 → OpenAI로 "단일 텍스트 프롬프트" 생성
        composed_prompt = await generate_prompt_from_guideline(
            req.guideline_json, extra
        )

        # c) final 스냅샷 & 세션 업데이트
        await db.execute(
            insert(SessionPrompt).values(
                session_id=req.session_id, stage="final", data={"text": composed_prompt}
            )
        )
        await db.execute(
            update(Session).where(Session.id == req.session_id).values(
                prompt={"text": composed_prompt},
                input_source="patient_analyzed" if session.initiator_type == "patient" else "therapist_manual"
            )
        )
        await db.commit()

    return ChatSendResp(assistant=assistant_text, composed_prompt=composed_prompt)
