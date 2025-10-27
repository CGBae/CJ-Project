from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import insert, select
import httpx
import os

from app.db import get_db
from app.models import User
from app.services.auth_service import (
    create_access_token, verify_password, hash_password
)
# app.schemas.py에 UserCreate, Token 스키마 추가 필요
from app.schemas import UserCreate, Token, KakaoLoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])

KAKAO_CLIENT_ID = os.getenv("KAKAO_CLIENT_ID")
KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token"
KAKAO_USERINFO_URL = "https://kapi.kakao.com/v2/user/me"

@router.post("/register")
async def register_user(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # ... (이메일 중복 검사 로직)
    hashed_pass = hash_password(user_in.password)
    await db.execute(
        insert(User).values(email=user_in.email, password_hash=hashed_pass)
    )
    await db.commit()
    return {"message": "User created successfully"}

@router.post("/login", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: AsyncSession = Depends(get_db)
):
    # ... (DB에서 form_data.username (이메일)로 User 조회)
    # user = ...
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    access_token = create_access_token(
        data={"sub": user.email}
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/kakao", response_model=Token)
async def login_with_kakao(
    req: KakaoLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    # 1. 프론트에서 받은 '인가 코드'로 카카오에 '액세스 토큰' 요청
    token_payload = {
        "grant_type": "authorization_code",
        "client_id": KAKAO_CLIENT_ID,
        "redirect_uri": req.redirect_uri, # 프론트가 사용한 redirect_uri
        "code": req.code,
    }
    
    async with httpx.AsyncClient() as client:
        try:
            # 카카오에 토큰 요청
            token_resp = await client.post(KAKAO_TOKEN_URL, data=token_payload)
            token_resp.raise_for_status() # 200 OK 아니면 에러
            kakao_token_data = token_resp.json()
            kakao_access_token = kakao_token_data.get("access_token")

            # 2. 받은 '액세스 토큰'으로 카카오에 '사용자 정보' 요청
            headers = {"Authorization": f"Bearer {kakao_access_token}"}
            user_info_resp = await client.get(KAKAO_USERINFO_URL, headers=headers)
            user_info_resp.raise_for_status()
            user_info = user_info_resp.json()
            
            kakao_id = str(user_info.get("id"))
            kakao_email = user_info.get("kakao_account", {}).get("email")

            if not kakao_id:
                raise HTTPException(500, "Kakao user ID not found")
            
            # (중요) 기존 JWT 시스템이 이메일(sub) 기반이므로 이메일 동의는 필수
            if not kakao_email:
                raise HTTPException(400, "Kakao email consent is required")

        except httpx.HTTPStatusError as e:
            raise HTTPException(502, f"Kakao API error: {e.response.text}")

    # 3. 내 DB에서 사용자 조회 또는 자동 회원가입
    q = select(User).where(User.social_id == kakao_id, User.social_provider == "kakao")
    res = await db.execute(q)
    user = res.scalar_one_or_none()
    
    if not user:
        # 사용자가 없으면 자동 회원가입
        # (선택적) 이메일이 이미 일반 회원으로 가입됐는지 확인
        q_email = select(User).where(User.email == kakao_email)
        res_email = await db.execute(q_email)
        if res_email.scalar_one_or_none():
             raise HTTPException(409, "Email already registered. Please log in with your password.")
        
        # 새 유저 생성
        new_user_stmt = (
            insert(User)
            .values(
                email=kakao_email,
                social_provider="kakao",
                social_id=kakao_id,
                hashed_password=None # 소셜 로그인이므로 비밀번호 없음
            )
            .returning(User)
        )
        res = await db.execute(new_user_stmt)
        user = res.scalar_one()
        await db.commit()

    # 4. '내 서비스'의 JWT 토큰 발급
    # (auth_service.py의 기존 함수 재사용)
    access_token = create_access_token(
        data={"sub": user.email} # 기존 JWT 시스템과 동일하게 이메일을 sub로 사용
    )
    return {"access_token": access_token, "token_type": "bearer"}