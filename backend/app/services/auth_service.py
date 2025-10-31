import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User

# .env 파일에 SECRET_KEY와 ALGORITHM 추가 필요
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login") # 4단계에서 만들 라우터 경로

def verify_password(plain_password, password_hash):
    return pwd_context.verify(plain_password, password_hash)

def hash_password(password):
    
    if not isinstance(password, (str, bytes)):
        raise TypeError("Password must be a string or bytes.")
     
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# 💡 [핵심 추가] 1. 임시 회원가입 토큰 생성 함수
def create_temp_register_token(data: dict):
    """카카오 신규 유저 정보(이메일, ID, 이름)를 담은 10분짜리 임시 토큰 생성"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=10) # 10분 후 만료
    to_encode.update({"exp": expire, "scope": "register"}) # 👈 스코프(용도) 지정
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# 💡 [핵심 추가] 2. 임시 토큰 검증 함수
async def verify_temp_register_token(token: str) -> dict:
    """임시 토큰을 검증하고 사용자 정보를 반환"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="임시 토큰이 유효하지 않거나 만료되었습니다.",
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("scope") != "register": # 👈 용도(scope) 확인
            raise credentials_exception
        
        # 카카오 정보 추출
        email = payload.get("email")
        kakao_id = payload.get("kakao_id")
        name = payload.get("name") # 👈 이름 정보 추가 (auth.py에서 넣어줘야 함)

        if kakao_id is None:
            raise credentials_exception
        return {"email": email, "kakao_id": kakao_id, "name": name}
        
    except JWTError:
        raise credentials_exception





async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    """
    API 요청 헤더의 토큰을 검증하고 DB에서 현재 사용자를 찾아 반환하는 의존성.
    이 함수가 바로 "라우터 보호"의 핵심입니다.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user_id = None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        try:
            user_id = int(user_id_str)
        except ValueError:
            raise credentials_exception
        
    except JWTError:
        raise credentials_exception
    
    # DB에서 사용자 조회
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    return user