from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import insert, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User # Session 등 다른 모델과 함께
from app.services.auth_service import get_current_user # 또는 app.api.deps
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
async def manual_generate(
    req: TherapistPromptReq,
    db: AsyncSession = Depends(get_db),
    # 💡 [핵심 추가] 인증된 사용자만 호출하도록 추가
    current_user: User = Depends(get_current_user)
):
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