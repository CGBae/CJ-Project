# backend/auth_dep.py
import os
from fastapi import HTTPException, status, Request

class User:
    def __init__(self, email: str, role: str = "therapist"):
        self.email = email
        self.role = role

async def get_current_user(req: Request) -> User:
    # ★ 테스트 우회
    if os.getenv("AUTH_BYPASS", "false").lower() == "true":
        return User(email="test@local", role="admin")  # 필요하면 role='therapist'

    # ↓ 원래 JWT/세션 검증 로직
    token = req.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    # ... 토큰 검증 및 파싱
    return User(email="real@user", role="therapist")
