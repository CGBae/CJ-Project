from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, insert, delete
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import json

from app.db import get_db
# 💡 1. [수정] 필요한 모델과 스키마 import
from app.models import Session, ConversationMessage, SessionPatientIntake, User
from app.schemas import SessionInfo 
from app.services.auth_service import get_current_user
from sqlalchemy.orm import selectinload, joinedload

router = APIRouter(prefix="/sessions", tags=["sessions"])

# (기존 @router.post("/start/{patient_code}") ... 는 주석 처리)

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
            # 💡 [수정] models.py 수정 없이 LEFT JOIN을 강제하기 위해
            # joinedload 대신 selectinload + isouter=True join 사용
            selectinload(Session.patient_intake) 
        )
        # 💡 [핵심 수정] patient_intake가 없는 세션도 포함하기 위해 'isouter=True' (LEFT JOIN)
        .join(SessionPatientIntake, Session.id == SessionPatientIntake.session_id, isouter=True)
        .order_by(Session.created_at.desc())
    )

    # 💡 [추가] /counsel 페이지가 'AI 상담' 목록만 요청할 경우
    if has_dialog is not None:
        # (이 경우 INNER JOIN이 되어야 하므로 .where()로 필터링)
        query = query.where(
            SessionPatientIntake.has_dialog == has_dialog
        )
    
    # 💡 [핵심 수정] 이 블록 전체가 'if' 밖으로 나와야 합니다.
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

@router.get("/my/{session_id}")
async def get_my_session_details(session_id: int):
    # (이 API는 현재 대시보드와 관련 없음)
    return {"session_id": session_id, "detail": "Not implemented"}