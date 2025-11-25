from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select, insert, update, desc, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import json
from datetime import datetime

from app.db import get_db
from app.models import User, Message, Connection
from app.schemas import MessageCreate, MessageResponse, ChatPartner
from app.services.auth_service import get_current_user, verify_access_token
from app.services.connection_manager import manager # 💡 방금 만든 매니저

router = APIRouter(prefix="/messenger", tags=["messenger"])

# 1. 내 대화 상대 목록 가져오기 (REST API - 초기 로딩용)
@router.get("/partners", response_model=List[ChatPartner])
async def get_chat_partners(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == 'patient':
        q = select(User).join(Connection, Connection.therapist_id == User.id).where(
            Connection.patient_id == current_user.id, Connection.status == 'ACCEPTED'
        )
    else: # therapist
        q = select(User).join(Connection, Connection.patient_id == User.id).where(
            Connection.therapist_id == current_user.id, Connection.status == 'ACCEPTED'
        )
    
    partners = (await db.execute(q)).scalars().all()
    
    results = []
    for partner in partners:
        unread_q = select(func.count(Message.id)).where(
            Message.sender_id == partner.id,
            Message.receiver_id == current_user.id,
            Message.is_read == False
        )
        unread_count = (await db.execute(unread_q)).scalar() or 0
        
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

# 2. 특정 상대와의 대화 기록 (REST API - 초기 로딩용)
@router.get("/{partner_id}", response_model=List[MessageResponse])
async def get_messages(
    partner_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = select(Message).where(
        or_(
            and_(Message.sender_id == current_user.id, Message.receiver_id == partner_id),
            and_(Message.sender_id == partner_id, Message.receiver_id == current_user.id)
        )
    ).order_by(Message.created_at.asc())
    
    messages = (await db.execute(q)).scalars().all()
    
    # 읽음 처리
    await db.execute(
        update(Message)
        .where(Message.sender_id == partner_id, Message.receiver_id == current_user.id, Message.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    
    partner = await db.get(User, partner_id)
    partner_name = partner.name if partner else "Unknown"
    my_name = current_user.name or "Me"
    
    return [
        MessageResponse(
            id=m.id, content=m.content, created_at=m.created_at, is_read=m.is_read,
            sender_id=m.sender_id, 
            sender_name=my_name if m.sender_id == current_user.id else partner_name,
            receiver_id=m.receiver_id,
            receiver_name=partner_name if m.receiver_id != current_user.id else my_name
        ) for m in messages
    ]

# 💡 3. [핵심] WebSocket 연결 및 메시지 처리
@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket, 
    token: str = Query(...), # 웹소켓은 헤더 대신 쿼리로 토큰을 받음
    db: AsyncSession = Depends(get_db)
):
    # 1. 토큰 검증
    try:
        payload = verify_access_token(token)
        user_id = int(payload.get("sub"))
        # DB에서 유저 정보 확인 (선택사항)
        user = await db.get(User, user_id)
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. 연결 수락
    await manager.connect(websocket, user_id)
    
    try:
        while True:
            # 3. 클라이언트로부터 메시지 수신
            data = await websocket.receive_json() 
            # data = { "receiver_id": int, "content": str }
            
            receiver_id = data.get("receiver_id")
            content = data.get("content")
            
            if receiver_id and content:
                # 4. DB에 저장
                new_msg = Message(
                    sender_id=user_id,
                    receiver_id=receiver_id,
                    content=content,
                    is_read=False
                )
                db.add(new_msg)
                await db.commit()
                await db.refresh(new_msg)
                
                # 전송할 데이터 포맷
                msg_data = {
                    "type": "new_message",
                    "message": {
                        "id": new_msg.id,
                        "content": new_msg.content,
                        "sender_id": user_id,
                        "receiver_id": receiver_id,
                        "created_at": new_msg.created_at.isoformat(),
                        "is_read": False
                    }
                }

                # 5. 실시간 전송 (나에게도, 상대방에게도)
                await manager.send_personal_message(msg_data, user_id) # 나
                await manager.send_personal_message(msg_data, receiver_id) # 상대방

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception as e:
        print(f"WebSocket Error: {e}")
        manager.disconnect(websocket, user_id)