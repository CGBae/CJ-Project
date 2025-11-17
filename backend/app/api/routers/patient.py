from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import insert, update, select
from sqlalchemy.ext.asyncio import AsyncSession
import json
from typing import List, Dict, Any # 💡 [추가]
from app.schemas import PatientIntake, PatientAnalyzeReq, SessionCreateResp, PromptResp
from app.models import Session, SessionPatientIntake, ConversationMessage, SessionPrompt
from app.db import get_db
from app.services.openai_client import generate_prompt_from_guideline
from app.services.prompt_from_guideline import build_extra_requirements_for_patient
from app.services.openai_chat import analyze_dialog_for_mood

from app.services.auth_service import get_current_user
from app.models import User

router = APIRouter(prefix="/patient", tags=["patient"])

@router.post("/intake", response_model=SessionCreateResp)
async def create_patient_session(
    payload: PatientIntake, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1) 세션 생성
    res = await db.execute(
        insert(Session).values(
            initiator_type="patient", 
            status="QUEUED",
            created_by=current_user.id
        ).returning(Session.id)
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
async def analyze_and_generate(
    req: PatientAnalyzeReq, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user) # 💡 [추가] 인증
):
    
    # 1. 인테이크 로드
    s_intake = await db.get(SessionPatientIntake, req.session_id)
    if not s_intake:
        raise HTTPException(404, "session intake not found")
        
    # 💡 [추가] 세션 소유권 확인
    session = await db.get(Session, req.session_id)
    if not session or session.created_by != current_user.id:
        raise HTTPException(403, "Not authorized for this session")

    # 2. 대화 기록 로드
    q_dialog = select(ConversationMessage.role, ConversationMessage.content)\
        .where(ConversationMessage.session_id == req.session_id)\
        .order_by(ConversationMessage.created_at.asc())
    
    
    
    dialog_rows = (await db.execute(q_dialog)).all()
    history = [{"role": r[0], "content": r[1]} for r in dialog_rows]

    # 💡 [핵심 수정] AI 분석가에게 '접수 내용(Intake)'도 전달하여 분석 정확도 향상
    intake_summary = [
        {"role": "system", "content": "--- [환자 사전 접수 내용] ---"},
        {"role": "user", "content": f"상담 목표: {s_intake.goal.get('text') if s_intake.goal else 'N/A'}"},
        {"role": "user", "content": f"선호 장르: {s_intake.prefs.get('preferredMusicGenres') if s_intake.prefs else 'N/A'}"},
        {"role": "user", "content": f"비선호 장르: {s_intake.prefs.get('dislikedMusicGenres') if s_intake.prefs else 'N/A'}"},
        {"role": "system", "content": "--- [AI 상담 대화 내용] ---"}
    ]
    
    # 💡 Intake 요약 + 실제 대화 기록
    full_history = intake_summary + history 

    # 3. 💡 [수정] OpenAI 대화 분석 호출 (full_history 사용)
    analyzed = await analyze_dialog_for_mood(full_history)
    
    # 4. 💡 [수정] 분석 결과 스냅샷 저장 (주석 해제)
    await db.execute(
         insert(SessionPrompt).values(
             session_id=req.session_id, stage="analyzed", 
             data=analyzed, confidence=analyzed.get("confidence", 0.0)
         )
    )

    # 5. 💡 [수정] 환자 흐름용 '추가 요구사항' 텍스트 구성 (주석 해제)
    # (s_intake.vas, .prefs, .goal이 DB에 JSON/dict로 저장되어 있다고 가정)
    extra = build_extra_requirements_for_patient(
        s_intake.vas, 
        s_intake.prefs, 
        s_intake.goal, 
        analyzed
    )
    
    # 💡 (기존의 'extra = f"--- ...' 블록은 '반드시' 삭제해야 합니다!)

    # 6. 음악 프롬프트 생성 (AI 작곡가 호출)
    # (guideline_json은 프론트에서 "{}"로 보냄)
    prompt_result = await generate_prompt_from_guideline(req.guideline_json, extra)
    
    # 7. 결과 추출 (기존과 동일)
    music_prompt = prompt_result.get("music_prompt", "calming ambient music, no vocals.")
    lyrics_text = prompt_result.get("lyrics_text", "가사가 생성되지 않았습니다.")
    
    final_data_to_save = {
        "text": music_prompt,
        "music_prompt": music_prompt,
        "lyrics_text": lyrics_text 
    }
    
    # 8. final 스냅샷 + 세션 업데이트 (기존과 동일)
    await db.execute(
        insert(SessionPrompt).values(session_id=req.session_id, stage="final", data=final_data_to_save)
    )
    await db.execute(
        update(Session).where(Session.id == req.session_id).values(
            prompt=final_data_to_save,
            input_source="patient_analyzed"
        )
    )
    await db.commit()
    
    # 9. 프론트엔드에 응답 (schemas.py의 PromptResp가 lyrics_text를 받는지 확인)
    return {
        "session_id": req.session_id, 
        "prompt_text": music_prompt,
        "lyrics_text": lyrics_text # 👈 schemas.py의 PromptResp에 이 필드가 있어야 함
    }