from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, or_, and_
from app.db import get_db
from app.models import Connection, User 
from app.services.auth_service import get_current_user
from app.schemas import ConnectionDetail, ConnectionRespondReq, ConnectionResponse, ConnectionRequest, ConnectionInfo

from typing import List

router = APIRouter(prefix="/connection", tags=["connection"])

# 1. [기존] 환자에게 들어온 대기 중인 연결 요청 조회 (알림용)
@router.get("/my_requests", response_model=List[ConnectionDetail])
async def get_pending_connections(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = select(Connection).where(
        Connection.patient_id == current_user.id,
        Connection.status == "PENDING"
    )
    results = await db.execute(q)
    connections = results.scalars().all()
    
    response_list = []
    for conn in connections:
        therapist = await db.get(User, conn.therapist_id)
        response_list.append(ConnectionDetail(
            connection_id=conn.id,
            therapist_id=conn.therapist_id,
            therapist_name=therapist.name if therapist else "알 수 없음",
            status=conn.status
        ))
    return response_list

# 2. [기존] 연결 요청에 응답 (수락/거절)
@router.post("/respond", status_code=status.HTTP_200_OK)
async def respond_to_connection(
    req: ConnectionRespondReq,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = select(Connection).where(Connection.id == req.connection_id)
    connection = (await db.execute(q)).scalar_one_or_none()

    if not connection:
        raise HTTPException(status_code=404, detail="요청을 찾을 수 없습니다.")
    
    # 권한 확인
    if current_user.role == 'patient' and connection.patient_id != current_user.id:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    if current_user.role == 'therapist' and connection.therapist_id != current_user.id:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")

    connection.status = req.response.value
    await db.commit()
    
    return {"message": f"연결 요청이 {req.response.value} 되었습니다."}

# 💡 3. [신규] 연결 요청 보내기 (ID 또는 이메일)
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
        
    # 2. 역할 검증 (서로 다른 역할이어야 함)
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

# 💡 4. [신규] 내 모든 연결 목록 조회 (마이페이지용)
@router.get("/list", response_model=List[ConnectionInfo])
async def get_my_connections(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 내가 환자면 -> 상담사 정보 조인
    if current_user.role == 'patient':
        stmt = (
            select(Connection, User)
            .join(User, Connection.therapist_id == User.id)
            .where(Connection.patient_id == current_user.id)
        )
    # 내가 상담사면 -> 환자 정보 조인
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
            created_at=conn.created_at
        ))
        
    return connections

# 💡 5. [신규] 연결 삭제/취소
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