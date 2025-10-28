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

async def get_user_by_email(db: AsyncSession, email: str):
    q = select(User).where(User.email == email)
    res = await db.execute(q)
    return res.scalar_one_or_none()

async def get_user_by_kakao_id(db: AsyncSession, kakao_id: int):
    q = select(User).where(User.kakao_id == kakao_id) # ⬅️ User.kakao_id로 조회
    res = await db.execute(q)
    return res.scalar_one_or_none()

@router.post("/register")
async def register_user(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # ... (이메일 중복 검사 로직)
    existing_user = await get_user_by_email(db, user_in.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered.")
    
    hashed_pass = hash_password(user_in.password)
    await db.execute(
        insert(User).values(email=user_in.email, password_hash=hashed_pass, role="patient")
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
    user = await get_user_by_email(db, form_data.username)
    
    if not user or not user.hashed_password or not verify_password(form_data.password, user.hashed_password): # password_hash 대신 hashed_password로 가정
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}
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
            token_payload = {
                "grant_type": "authorization_code",
                "client_id": KAKAO_CLIENT_ID,
                "redirect_uri": req.redirect_uri,
                "code": req.code,
            }
            token_resp = await client.post(KAKAO_TOKEN_URL, data=token_payload)
            token_resp.raise_for_status() # 200 OK 아니면 에러
            kakao_token_data = token_resp.json()
            kakao_access_token = kakao_token_data.get("access_token")

            # 2. 받은 '액세스 토큰'으로 카카오에 '사용자 정보' 요청
            headers = {"Authorization": f"Bearer {kakao_access_token}"}
            user_info_resp = await client.get(KAKAO_USERINFO_URL, headers=headers)
            user_info_resp.raise_for_status()
            user_info = user_info_resp.json()
            
            kakao_id = user_info.get("id")
            kakao_email = user_info.get("kakao_account", {}).get("email")

            if not kakao_id:
                raise HTTPException(500, "Kakao user ID not found")
            
            try:
                kakao_id_int = int(kakao_id)
            except (TypeError, ValueError):
                raise HTTPException(status_code=500, detail="Kakao ID is invalid type.")

        except httpx.HTTPStatusError as e:
            raise HTTPException(502, f"Kakao API error: {e.response.text}")
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to communicate with Kakao.")

    # 3. 내 DB에서 사용자 조회 또는 자동 회원가입
    user = await get_user_by_kakao_id(db, kakao_id_int)
    
    if not user:
        # 사용자가 없으면 자동 회원가입
        # (선택적) 이메일이 이미 일반 회원으로 가입됐는지 확인
        existing_email_user = await get_user_by_email(db, kakao_email)
        if existing_email_user:
            # 기존 이메일 유저에게 kakao_id를 연결해 줍니다.
            if existing_email_user.kakao_id is None:
                existing_email_user.kakao_id = kakao_id
                existing_email_user.social_provider = "kakao"
                await db.commit()
                await db.refresh(existing_email_user)
                user = existing_email_user
            else:
                # 이미 다른 소셜 계정으로 연결되어 있다면 충돌 에러
                raise HTTPException(status_code=409, detail="Email already linked to another social account.")
        else:
            # 새 유저 생성
            new_user_stmt = (
                insert(User)
                .values(
                    email=kakao_email,
                    social_provider="kakao",
                    kakao_id=kakao_id_int, # ⬅️ [수정] User 모델의 kakao_id 필드에 저장
                    password_hash=None,
                    role="patient" # 기본 역할 설정
                )
                .returning(User)
            )
            res = await db.execute(new_user_stmt)
            user = res.scalar_one()
            await db.commit()

    # 4. '내 서비스'의 JWT 토큰 발급
    # (auth_service.py의 기존 함수 재사용)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role} # 기존 JWT 시스템과 동일하게 이메일을 sub로 사용
    )
    return {"access_token": access_token, "token_type": "bearer"}