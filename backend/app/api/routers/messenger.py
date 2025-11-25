from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, insert, update, desc, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.db import get_db
from app.models import User, Message, Connection
from app.schemas import MessageCreate, MessageResponse, ChatPartner
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/messenger", tags=["messenger"])

# 1. 대화 상대 목록 가져오기 (안 읽은 메시지 수 포함)
@router.get("/partners", response_model=List[ChatPartner])
async def get_chat_partners(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1) 연결된 사용자 조회 (상담사 <-> 환자)
    if current_user.role == 'patient':
        # 내가 환자면 -> 나의 상담사들 조회
        q = select(User).join(Connection, Connection.therapist_id == User.id).where(
            Connection.patient_id == current_user.id, Connection.status == 'ACCEPTED'
        )
    else: 
        # 내가 상담사면 -> 나의 환자들 조회
        q = select(User).join(Connection, Connection.patient_id == User.id).where(
            Connection.therapist_id == current_user.id, Connection.status == 'ACCEPTED'
        )
    
    partners = (await db.execute(q)).scalars().all()
    
    results = []
    for partner in partners:
        # 2) 안 읽은 메시지 수 (상대방이 보냈고, 내가 아직 안 읽은 것)
        unread_q = select(func.count(Message.id)).where(
            Message.sender_id == partner.id,
            Message.receiver_id == current_user.id,
            Message.is_read == False
        )
        unread_count = (await db.execute(unread_q)).scalar() or 0
        
        # 3) 마지막 메시지 내용
        last_msg_q = select(Message).where(
            or_(
                and_(Message.sender_id == current_user.id, Message.receiver_id == partner.id),
                and_(Message.sender_id == partner.id, Message.receiver_id == current_user.id)
            )
        ).order_by(desc(Message.created_at)).limit(1)
        last_msg = (await db.execute(last_msg_q)).scalar_one_or_none()
        
        results.append(ChatPartner(
            user_id=partner.id,
            name=partner.name or partner.email,
            role=partner.role,
            unread_count=unread_count,
            last_message=last_msg.content if last_msg else None,
            last_message_time=last_msg.created_at if last_msg else None
        ))
        
    return results

# 2. 특정 상대와의 쪽지 내용 조회
@router.get("/{partner_id}", response_model=List[MessageResponse])
async def get_messages(
    partner_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 주고받은 메시지 모두 조회 (과거순 정렬)
    q = select(Message).where(
        or_(
            and_(Message.sender_id == current_user.id, Message.receiver_id == partner_id),
            and_(Message.sender_id == partner_id, Message.receiver_id == current_user.id)
        )
    ).order_by(Message.created_at.asc())
    
    messages = (await db.execute(q)).scalars().all()
    
    # 읽음 처리: 상대방이 보낸 메시지를 내가 조회했으니 '읽음'으로 변경
    await db.execute(
        update(Message)
        .where(Message.sender_id == partner_id, Message.receiver_id == current_user.id, Message.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    
    return messages

# 3. 쪽지 전송
@router.post("/", response_model=MessageResponse)
async def send_message(
    msg_in: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 수신자 존재 확인
    receiver = await db.get(User, msg_in.receiver_id)
    if not receiver:
        raise HTTPException(404, "사용자를 찾을 수 없습니다.")
        
    new_msg = Message(
        sender_id=current_user.id,
        receiver_id=msg_in.receiver_id,
        content=msg_in.content
    )
    db.add(new_msg)
    await db.commit()
    await db.refresh(new_msg)
    
    return new_msg