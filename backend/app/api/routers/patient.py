from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import insert, update, select
from sqlalchemy.ext.asyncio import AsyncSession
import json

from app.schemas import PatientIntake, PatientAnalyzeReq, SessionCreateResp, PromptResp
from app.models import Session, SessionPatientIntake, ConversationMessage, SessionPrompt
from app.db import get_db
from app.services.openai_client import generate_prompt_from_guideline
# from app.services.prompt_from_guideline import build_extra_requirements_for_patient
# from app.services.openai_chat import analyze_dialog_for_mood

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
async def analyze_and_generate(req: PatientAnalyzeReq, db: AsyncSession = Depends(get_db)):
    # 간단화: 대화 요약/키워드는 여기선 생략하고, 인테이크 기반 + '분석무드:calming' 가정
    # 실제로는 OpenAI에 먼저 대화 분석 요청 후, 그 결과를 analyzed에 채워 넣으세요.
    # analyzed = await call_openai_analyze_dialog(...)

    # 인테이크 로드
    s_intake = await db.get(SessionPatientIntake, req.session_id)
    if not s_intake:
        raise HTTPException(404, "session intake not found")

    q_dialog = select(ConversationMessage.role, ConversationMessage.content)\
        .where(ConversationMessage.session_id == req.session_id)\
        .order_by(ConversationMessage.created_at.asc())
    
    dialog_rows = (await db.execute(q_dialog)).all()
    history = [{"role": r[0], "content": r[1]} for r in dialog_rows]

    # [수정된 로직]: OpenAI 대화 분석 호출
    # analyzed = await analyze_dialog_for_mood(history)
    
    # 분석 결과에 목표가 없으면 인테이크 목표를 사용 (인테이크 목표가 DB 저장 시 dict 또는 JSONB라고 가정)
    # if not analyzed.get("target") and s_intake.goal:
    #     analyzed["target"] = s_intake.goal 

    # analyzed 스냅샷 (analyzed 객체 사용)
    # await db.execute(
    #     insert(SessionPrompt).values(
    #         session_id=req.session_id, stage="analyzed", 
    #         data=analyzed, confidence=analyzed.get("confidence", 0.0) # confidence도 분석 결과 사용
    #     )
    # )

    # 환자 흐름용 '추가 요구사항' 텍스트 구성
    # extra = build_extra_requirements_for_patient(s_intake.vas, s_intake.prefs, s_intake.goal, analyzed)

    history_text = "\n".join([f"[{m['role']}]: {m['content']}" for m in history])
    
    extra = (
        f"--- [환자 사전 정보 (User Input) - JSON 형식] ---\n"
        f"1. 목표(Goal): {json.dumps(s_intake.goal, indent=2) if s_intake.goal else '없음'}\n"
        f"2. VAS 점수: {json.dumps(s_intake.vas, indent=2) if s_intake.vas else '없음'}\n"
        f"3. 선호/금기(Prefs): {json.dumps(s_intake.prefs, indent=2) if s_intake.prefs else '없음'}\n\n"
        f"--- [환자 전체 대화 내용 (Dialog)] ---\n"
        f"{history_text if history_text else '대화 내용 없음. 사전 정보를 기반으로 생성.'}\n"
    )

    prompt_result = await generate_prompt_from_guideline(req.guideline_json, extra)
    
    # 결과 추출
    music_prompt = prompt_result.get("music_prompt", "calming ambient music, no vocals.")
    lyrics_text = prompt_result.get("lyrics_text", "가사가 생성되지 않았습니다.")
    
    # DB에 저장할 최종 데이터 구성
    final_data_to_save = {
        "text": music_prompt,        # 👈 ElevenLabs에 전달할 음악 지시만 'text' 필드에 저장
        "music_prompt": music_prompt,
        "lyrics_text": lyrics_text    # 👈 프론트엔드에서 보여줄 가사 전문
    }
    
    # 5. final 스냅샷 + 세션 업데이트
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
    
    # 프론트엔드에 응답 (PromptResp는 prompt_text만 요구하므로 music_prompt를 반환)
    return {
        "session_id": req.session_id, 
        "prompt_text": music_prompt,
        "lyrics_text": lyrics_text # 👈 가사 전문을 응답에 추가
    }
