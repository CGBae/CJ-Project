from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import insert, select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any, Optional
from app.db import get_db
from sqlalchemy.orm import selectinload, joinedload
from app.models import ConversationMessage, Session, SessionPatientIntake, TherapistManualInputs, SessionPrompt, User
from app.services.openai_chat import chat_complete, analyze_dialog_for_mood
from app.services.intent_detector import is_compose_request
from app.services.openai_client import generate_prompt_from_guideline
from app.services.prompt_from_guideline import generate_first_counseling_message
from app.services.prompt_from_guideline import (
    build_extra_requirements_for_patient,
    build_extra_requirements_for_therapist
)

from app.services.auth_service import get_current_user
from app.models import User
from app.schemas import SimpleChatMessage

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatSendReq(BaseModel):
    session_id: int
    message: str
    guideline_json: str | None = None  # 음악 생성시 필요

class ChatSendResp(BaseModel):
    assistant: str
    composed_prompt: str | None = None  # 음악 생성 트리거 시 반환

@router.post("/send", response_model=ChatSendResp)
async def chat_send(
    req: ChatSendReq, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1) 세션 확인
    session = await db.get(Session, req.session_id)
    if not session:
        raise HTTPException(404, "session not found")
    
    if session.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your session")
    
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
        
    await db.commit()

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

class ChatHistoryResp(BaseModel):
    """대화 기록 응답을 위한 스키마"""
    session_id: int
    # 💡 [수정] 프론트엔드 타입과 일치시키기 위해 Dict 형태 유지
    history: List[Dict[str, Any]] 
    goal_text: Optional[str] = None # 👈 [추가] 상담 목표

@router.get("/history/{session_id}", response_model=ChatHistoryResp)
async def get_chat_history(
    session_id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # 1. 세션 조회
    q = select(Session).where(
        Session.id == session_id, 
        Session.created_by == current_user.id
    ).options(
        selectinload(Session.messages), 
        joinedload(Session.patient_intake)
    )
    session = (await db.execute(q)).scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    p_intake = session.patient_intake
    goal_text = p_intake.goal.get("text") if p_intake and p_intake.goal else None
    
    # 💡 [수정] DB에 메시지가 하나도 없으면 -> AI가 첫인사를 생성해서 저장!
    if not session.messages:
        vas_data = p_intake.vas if p_intake else None
        
        # AI 생성 요청
        first_msg_content = await generate_first_counseling_message(
            user_name=current_user.name or "회원",
            goal_text=goal_text,
            vas_data=vas_data
        )
        
        # DB에 저장 (Role: assistant)
        first_message = ConversationMessage(
            session_id=session.id,
            role="assistant",
            content=first_msg_content
        )
        db.add(first_message)
        await db.commit()
        await db.refresh(first_message)
        
        history = [SimpleChatMessage.model_validate(first_message)]
    else:
        history = [SimpleChatMessage.model_validate(msg) for msg in session.messages]

    return ChatHistoryResp(
    session_id=session_id,
    history=[h.model_dump() for h in history],   # dict로 변환
    goal_text=goal_text
)


class DeleteHistoryResp(BaseModel):
    session_id: int
    deleted_count: int

@router.delete("/history/{session_id}", response_model=DeleteHistoryResp)
async def delete_chat_history(session_id: int, db: AsyncSession = Depends(get_db)):
    """
    주어진 세션 ID에 해당하는 '대화 기록'을 모두 삭제합니다.
    (dashboard/patient/page.tsx가 호출합니다)
    """
    # 1. 삭제할 메시지 수 확인
    q_count = select(func.count(ConversationMessage.id)).where(ConversationMessage.session_id == session_id)
    count_result = (await db.execute(q_count)).scalar_one_or_none() or 0

    if count_result == 0:
        return {"session_id": session_id, "deleted_count": 0}

    # 2. 메시지 삭제
    q_delete = delete(ConversationMessage).where(ConversationMessage.session_id == session_id)
    await db.execute(q_delete)
    
    # 3. Intake의 has_dialog 플래그 초기화
    await db.execute(
        update(SessionPatientIntake)
        .where(SessionPatientIntake.session_id == session_id)
        .values(has_dialog=False)
    )
    
    await db.commit()
    
    return {"session_id": session_id, "deleted_count": count_result}