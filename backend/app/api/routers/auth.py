from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import insert, select
import httpx
import os
from fastapi.responses import JSONResponse
from app.db import get_db
from app.models import User
from app.services.auth_service import (
    create_access_token, verify_password, hash_password, get_current_user, create_temp_register_token, verify_temp_register_token # 💡 [추가] 임시 토큰 함수
)
# app.schemas.py에 UserCreate, Token 스키마 추가 필요
from app.schemas import UserCreate, Token, KakaoLoginRequest, UserPublic,KakaoLoginResponse, SocialRegisterRequest # 💡 [추가] 새 스키마

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
        insert(User).values(
            email=user_in.email, 
            password_hash=hashed_pass, 
            role=user_in.role, # 👈 'patient' 대신 user_in.role 사용
            name=user_in.name
        )
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
    
    if not user or not user.password_hash or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}
    )
    return Token(access_token=access_token, token_type="bearer")

@router.post("/kakao", response_model=KakaoLoginResponse) # 👈 1. 응답 모델 변경
async def login_with_kakao(
    req: KakaoLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    # 1. 카카오 정보 요청 (닉네임 가져오기 추가)
    token_payload = { "grant_type": "authorization_code", "client_id": KAKAO_CLIENT_ID,
                      "redirect_uri": req.redirect_uri, "code": req.code }
    
    try:
        async with httpx.AsyncClient() as client:
            # ... (토큰 요청 부분) ...
            token_resp = await client.post(KAKAO_TOKEN_URL, data=token_payload)
            token_resp.raise_for_status()
            kakao_token_data = token_resp.json()
            kakao_access_token = kakao_token_data.get("access_token")

            # ... (사용자 정보 요청 부분) ...
            headers = {"Authorization": f"Bearer {kakao_access_token}"}
            user_info_resp = await client.get(KAKAO_USERINFO_URL, headers=headers)
            user_info_resp.raise_for_status()
            user_info = user_info_resp.json()
            
            kakao_id = user_info.get("id")
            kakao_email = user_info.get("kakao_account", {}).get("email")
            kakao_nickname = user_info.get("properties", {}).get("nickname")

            if not kakao_id: raise HTTPException(500, "Kakao user ID not found")
            kakao_id_int = int(kakao_id)
            
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to communicate with Kakao: {e}")

    # 2. 내 DB에서 사용자 조회
    user = await get_user_by_kakao_id(db, kakao_id_int)
    
    # 💡 3. 분기 처리
    if user:
        # --- [기존 사용자] ---
        # 4. 즉시 로그인 토큰 발급 (쿠키 설정 삭제, JSON 반환)
        access_token = create_access_token(
            data={"sub": str(user.id), "role": user.role}
        )
        return KakaoLoginResponse(
            status="success", 
            access_token=access_token
        )
    
    else:
        # --- [신규 사용자] ---
        # 4. (중요) 자동 회원가입 로직 *삭제*

        # 5. 임시 회원가입 토큰 발급 (카카오 정보 포함)
        temp_token = create_temp_register_token(
            data={
                "email": kakao_email, 
                "kakao_id": kakao_id_int, 
                "name": kakao_nickname
            }
        )
        return KakaoLoginResponse(
            status="register_required", 
            temp_token=temp_token
        )

# 💡 [핵심 추가] /register/social (소셜 가입 완료)
@router.post("/register/social", response_model=Token)
async def register_social_user(
    req: SocialRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    # 1. 임시 토큰 검증
    try:
        payload = await verify_temp_register_token(req.temp_token)
    except HTTPException as e:
        raise e # 토큰 만료 또는 잘못된 토큰
    
    email = payload.get("email")
    kakao_id = payload.get("kakao_id")
    name = payload.get("name")
    
    # 2. (선택적) 이메일 중복 재확인
    if email and (await get_user_by_email(db, email)):
        raise HTTPException(status_code=400, detail="Email already registered by another account.")

    # 3. DB에 최종 회원가입 (선택한 role 사용)
    try:
        new_user_stmt = (
            insert(User)
            .values(
                email=email,
                social_provider="kakao",
                kakao_id=kakao_id,
                # name=name, # 👈 이름 저장
                password_hash=None,
                role=req.role, # 👈 프론트에서 선택한 역할 저장!
                name=req.name,
            )
            .returning(User)
        )
        res = await db.execute(new_user_stmt)
        user = res.scalar_one()
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"User creation failed: {e}")

    # 4. 최종 로그인 토큰 발급
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}
    )
    return Token(access_token=access_token, token_type="bearer")

@router.get("/me", response_model=UserPublic)
async def get_my_info(current_user: User = Depends(get_current_user)):
    """
    현재 인증된 사용자 정보 (JWT 토큰 기반)를 반환합니다.
    Header.tsx에서 인증 상태 및 역할을 확인하는 데 사용됩니다.
    """
    # get_current_user는 DB에서 User 객체를 성공적으로 가져왔음을 보장합니다.
    return current_user

