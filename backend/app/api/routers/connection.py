from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.db import get_db
from app.models import Connection, User # Connection 모델이 필요합니다.
from app.services.auth_service import get_current_user
from app.schemas import ConnectionDetail, ConnectionRespondReq, ConnectionResponse

from typing import List

# connection 라우터 정의
router = APIRouter(prefix="/connection", tags=["connection"])

# [1] 환자에게 들어온 연결 요청 목록 조회
@router.get("/my_requests", response_model=List[ConnectionDetail])
async def get_pending_connections(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    현재 환자에게 들어온 상담사(Therapist)의 연결 요청 목록을 조회합니다.
    """
    # Connection 모델의 구조를 가정합니다:
    # (patient_id: int, therapist_id: int, status: str)
    
    # 현재 사용자(환자)에게 연결 요청(PENDING 상태)이 들어온 목록을 조회
    q = select(Connection).where(
        Connection.patient_id == current_user.id,
        Connection.status == "PENDING"
    )
    
    results = await db.execute(q)
    connections = results.scalars().all()
    
    if not connections:
        return []

    # 응답 스키마에 맞게 데이터 가공
    response_list = []
    for conn in connections:
        # 연결을 요청한 상담사의 이름이 필요하므로 User 테이블에서 조회해야 합니다.
        therapist_q = select(User).where(User.id == conn.therapist_id)
        therapist = (await db.execute(therapist_q)).scalar_one_or_none()
        
        therapist_name = therapist.name if therapist and therapist.name else f"상담사 #{conn.therapist_id}"
        
        response_list.append(ConnectionDetail(
            connection_id=conn.id,
            therapist_id=conn.therapist_id,
            therapist_name=therapist_name,
            status=conn.status # PENDING 상태일 것
        ))
        
    return response_list

# [2] 연결 요청에 응답 (수락/거절)
@router.post("/respond", status_code=status.HTTP_200_OK)
async def respond_to_connection(
    req: ConnectionRespondReq,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    환자가 연결 요청을 수락하거나 거절합니다.
    """
    # 1. 연결 요청이 현재 사용자(환자)에게 온 것이 맞는지 확인
    q = select(Connection).where(
        Connection.id == req.connection_id,
        Connection.patient_id == current_user.id, # 요청을 받은 사람이 본인인지 확인
        Connection.status == "PENDING" # 아직 응답 대기 중인 요청인지 확인
    )
    result = await db.execute(q)
    connection = result.scalar_one_or_none()

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 연결 요청을 찾을 수 없거나 이미 처리되었습니다."
        )

    # 2. Connection 상태 업데이트
    # req.response는 ConnectionResponse Enum ("ACCEPTED" 또는 "REJECTED") 값 중 하나입니다.
    connection.status = req.response.value
    await db.commit()
    
    return {"message": f"연결 요청이 성공적으로 {req.response.value} 처리되었습니다."}
