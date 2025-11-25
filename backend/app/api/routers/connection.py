from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.db import get_db
from app.models import Connection, User # Connection 모델이 필요합니다.
from app.services.auth_service import get_current_user
from app.schemas import ConnectionDetail, ConnectionRespondReq, ConnectionResponse, ConnectionRequest, ConnectionInfo

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

# 💡 [신규] 연결 요청 보내기 (ID 또는 이메일)
@router.post("/request", status_code=status.HTTP_201_CREATED)
async def request_connection(
    req: ConnectionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. 상대방 찾기
    target_user = None
    if req.target_id:
        target_user = await db.get(User, req.target_id)
    elif req.email:
        result = await db.execute(select(User).where(User.email == req.email))
        target_user = result.scalar_one_or_none()
        
    if not target_user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
        
    # 2. 역할 검증 (나와 다른 역할이어야 함)
    if current_user.role == target_user.role:
        raise HTTPException(status_code=400, detail="같은 역할(환자-환자, 상담사-상담사)끼리는 연결할 수 없습니다.")

    # 3. 중복 연결 확인
    patient_id = current_user.id if current_user.role == 'patient' else target_user.id
    therapist_id = target_user.id if current_user.role == 'patient' else current_user.id
    
    q_exist = select(Connection).where(
        Connection.patient_id == patient_id,
        Connection.therapist_id == therapist_id
    )
    existing = (await db.execute(q_exist)).scalar_one_or_none()
    
    if existing:
        if existing.status == 'ACCEPTED':
            raise HTTPException(status_code=400, detail="이미 연결된 사용자입니다.")
        else:
            raise HTTPException(status_code=400, detail="이미 연결 요청이 진행 중입니다.")

    # 4. 연결 생성
    new_conn = Connection(
        patient_id=patient_id,
        therapist_id=therapist_id,
        status="PENDING"
    )
    db.add(new_conn)
    await db.commit()
    
    return {"message": "연결 요청을 보냈습니다."}

# 💡 [신규] 내 모든 연결 목록 조회 (마이페이지용 - 핵심!)
@router.get("/list", response_model=List[ConnectionInfo])
async def get_my_connections(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    내가 맺은 모든 연결(대기중, 수락됨)을 상대방 정보와 함께 반환합니다.
    """
    # 내가 환자면 -> 상담사 정보를 가져옴
    if current_user.role == 'patient':
        stmt = (
            select(Connection, User)
            .join(User, Connection.therapist_id == User.id)
            .where(Connection.patient_id == current_user.id)
        )
        
    # 내가 상담사면 -> 환자 정보를 가져옴
    else:
        stmt = (
            select(Connection, User)
            .join(User, Connection.patient_id == User.id)
            .where(Connection.therapist_id == current_user.id)
        )
        
    result = await db.execute(stmt)
    rows = result.all()
    
    connections = []
    for conn, partner in rows:
        connections.append(ConnectionInfo(
            connection_id=conn.id,
            partner_id=partner.id,
            partner_name=partner.name or "이름 없음",
            partner_email=partner.email,
            partner_role=partner.role,
            status=conn.status,
            created_at=conn.created_at,
            is_sender=False # (임시값)
        ))
        
    return connections

# 💡 [신규] 연결 삭제/취소
@router.delete("/{connection_id}", status_code=204)
async def delete_connection(
    connection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conn = await db.get(Connection, connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="연결 정보를 찾을 수 없습니다.")
        
    # 내 연결인지 확인
    if conn.patient_id != current_user.id and conn.therapist_id != current_user.id:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
        
    await db.delete(conn)
    await db.commit()
    return None