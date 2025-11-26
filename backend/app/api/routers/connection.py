from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, or_, and_
from app.db import get_db
from app.models import Connection, User 
from app.services.auth_service import get_current_user
# schemas.py에 정의된 모델들 사용
from app.schemas import ConnectionDetail, ConnectionRespondReq, ConnectionResponse, ConnectionRequest, ConnectionInfo

from typing import List

router = APIRouter(prefix="/connection", tags=["connection"])

# 💡 [수정] 내게 들어온(혹은 관련된) 대기 중인 연결 요청 조회
@router.get("/my_requests", response_model=List[ConnectionDetail])
async def get_pending_connections(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    상태가 'PENDING'인 나의 연결 정보를 조회합니다.
    환자라면 patient_id가 나인 것, 상담사라면 therapist_id가 나인 것을 찾습니다.
    """
    
    # 1. 쿼리 조건 분기
    if current_user.role == 'patient':
        q = select(Connection).where(
            Connection.patient_id == current_user.id,
            Connection.status == "PENDING"
        )
    else: # therapist
        q = select(Connection).where(
            Connection.therapist_id == current_user.id,
            Connection.status == "PENDING"
        )
        
    results = await db.execute(q)
    connections = results.scalars().all()
    
    response_list = []
    for conn in connections:
        # 2. 상대방 정보 조회
        # 내가 환자면 상대는 상담사, 내가 상담사면 상대는 환자
        partner_id = conn.therapist_id if current_user.role == 'patient' else conn.patient_id
        partner = await db.get(User, partner_id)
        
        partner_name = partner.name if partner else f"사용자 #{partner_id}"
        
        # 3. 응답 데이터 생성 (ConnectionDetail 스키마 활용)
        # therapist_name 필드를 '상대방 이름'으로 활용합니다.
        response_list.append(ConnectionDetail(
            connection_id=conn.id,
            therapist_id=conn.therapist_id, # (참고용)
            therapist_name=partner_name,    # 화면에 표시될 상대방 이름
            status=conn.status
        ))
            
    return response_list

# [2] 연결 요청에 응답 (수락/거절)
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
    
    # 권한 확인 (당사자만 가능)
    is_involved = (connection.patient_id == current_user.id) or (connection.therapist_id == current_user.id)
    if not is_involved:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")

    connection.status = req.response.value
    await db.commit()
    
    return {"message": f"연결이 {req.response.value} 되었습니다."}

# 💡 [신규] 연결 요청 보내기 (ID 또는 이메일)
@router.post("/request", status_code=status.HTTP_201_CREATED)
async def request_connection(
    req: ConnectionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. 상대방 찾기 (ID 우선, 없으면 이메일)
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

    # 3. ID 배정
    patient_id = current_user.id if current_user.role == 'patient' else target_user.id
    therapist_id = target_user.id if current_user.role == 'patient' else current_user.id
    
    # 4. 중복 확인
    q_exist = select(Connection).where(
        Connection.patient_id == patient_id,
        Connection.therapist_id == therapist_id
    )
    existing = (await db.execute(q_exist)).scalar_one_or_none()
    
    if existing:
        status_msg = "이미 연결되어 있습니다." if existing.status == 'ACCEPTED' else "이미 연결 요청 대기 중입니다."
        raise HTTPException(status_code=400, detail=status_msg)

    # 5. 생성
    new_conn = Connection(
        patient_id=patient_id,
        therapist_id=therapist_id,
        status="PENDING"
    )
    db.add(new_conn)
    await db.commit()
    
    return {"message": "연결 요청을 보냈습니다."}

@router.get("/list", response_model=List[ConnectionInfo])
async def get_my_connections(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    내가 맺은 모든 연결(대기중, 수락됨)을 상대방 정보와 함께 반환합니다.
    """
    # 1. 상대방 정보와 연결 테이블을 OUTER JOIN하여 가져옴
    if current_user.role == 'patient':
        # 환자는 therapist_id로 상대방(User) 조인
        stmt = (
            select(Connection, User)
            .outerjoin(User, Connection.therapist_id == User.id)
            .where(Connection.patient_id == current_user.id)
        )
    else:
        # 상담사는 patient_id로 상대방(User) 조인
        stmt = (
            select(Connection, User)
            .outerjoin(User, Connection.patient_id == User.id)
            .where(Connection.therapist_id == current_user.id)
        )

    result = await db.execute(stmt)
    # result.all()은 [(Connection, User), (Connection, User), ...] 형태의 튜플 리스트를 반환합니다.
    rows = result.all()

    connections = []
    for conn, partner in rows:
        # 💡 [오류 방지] partner가 None일 경우 안전하게 처리 (LEFT JOIN 결과)
        if partner is None:
            # 상대방이 삭제되어 User 정보가 없는 경우
            partner_name = "알 수 없는 사용자"
            partner_email = "삭제된 계정"
            partner_id = None
            partner_role = "unknown"
        else:
            partner_id = partner.id
            partner_name = partner.name or "이름 없음"
            partner_email = partner.email or ""
            partner_role = partner.role
            
        connections.append(ConnectionInfo(
            connection_id=conn.id,
            partner_id=partner_id,
            partner_name=partner_name,
            partner_email=partner_email,
            partner_role=partner_role,
            status=conn.status,
            created_at=conn.created_at,
            is_sender=False 
        ))
        
    return connections


# 💡 [신규] 연결 삭제
@router.delete("/{connection_id}", status_code=204)
async def delete_connection(
    connection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conn = await db.get(Connection, connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="연결 정보를 찾을 수 없습니다.")
        
    if conn.patient_id != current_user.id and conn.therapist_id != current_user.id:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
        
    await db.delete(conn)
    await db.commit()
    return None