import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import insert
from backend.app.db import SessionLocal, engine
from backend.app.models import User, Session, ConversationMessage

async def seed_data():
    async with SessionLocal() as session:
        # 1) User 예시
        user_stmt = insert(User).values([
            {"email": "therapist1@example.com", "password_hash": "pw1", "role": "therapist"},
            {"email": "therapist2@example.com", "password_hash": "pw2", "role": "therapist"}
        ])
        await session.execute(user_stmt)

        # 2) Session 예시
        session_stmt = insert(Session).values([
            {"created_by": 1, "status": "READY", "prompt": {"genre": "ambient", "bpm": [70, 80]}},
            {"created_by": 1, "status": "QUEUED", "prompt": {"genre": "piano", "bpm": [60, 70]}}
        ])
        await session.execute(session_stmt)

        # 3) ConversationMessage 예시
        msg_stmt = insert(ConversationMessage).values([
            {"session_id": 1, "role": "therapist", "content": "안녕하세요, 오늘 상태는 어떠신가요?"},
            {"session_id": 1, "role": "user", "content": "조금 불안하고 긴장돼요."}
        ])
        await session.execute(msg_stmt)

        await session.commit()

if __name__ == "__main__":
    asyncio.run(seed_data())
