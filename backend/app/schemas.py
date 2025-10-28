from __future__ import annotations
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr

# 공통
class SessionCreateResp(BaseModel):
    session_id: int
    status: str = "QUEUED"

# 환자 흐름
class PatientIntake(BaseModel):
    vas: Optional[Dict[str, int]] = None
    prefs: Optional[Dict[str, Any]] = None
    goal: Optional[Dict[str, str]] = None
    dialog: Optional[List[Dict[str,str]]] = None  # [{role, content}...]

class PatientAnalyzeReq(BaseModel):
    session_id: int
    guideline_json: str

class PromptResp(BaseModel):
    session_id: int
    prompt_text: str
    lyrics_text: Optional[str] = None

# 상담사 흐름
class TherapistManualInput(BaseModel):
    genre: Optional[str] = None
    mood: Optional[str] = None
    bpm_min: Optional[int] = None
    bpm_max: Optional[int] = None
    key_signature: Optional[str] = None
    vocals_allowed: Optional[bool] = False
    include_instruments: Optional[List[str]] = None
    exclude_instruments: Optional[List[str]] = None
    duration_sec: Optional[int] = 120
    notes: Optional[Any] = None

class TherapistPromptReq(BaseModel):
    session_id: int
    guideline_json: str
    manual: TherapistManualInput

class KakaoLoginRequest(BaseModel):
    code: str
    redirect_uri: str
    
class Token(BaseModel):
    """
    /auth/login, /auth/kakao 응답 스키마.
    프론트엔드에 JWT 토큰을 전달합니다.
    """
    access_token: str
    token_type: str = "bearer"
    
class UserCreate(BaseModel):
    """
    /auth/register (일반 회원가입) 요청 스키마.
    """
    # pydantic의 EmailStr을 사용하면 이메일 형식을 자동으로 검증해줍니다.
    email: EmailStr 
    # Field를 사용하여 최소 8자리의 비밀번호를 강제합니다.
    password: str = Field(..., min_length=8)

class UserPublic(BaseModel):
    """
    API 응답에서 비밀번호 등 민감 정보를 제외하고
    안전하게 사용자 정보를 반환하기 위한 스키마.
    """
    id: int
    kakao_id: Optional[int] = None
    email: Optional[EmailStr] = None # 소셜 로그인은 이메일이 없을 수 있음
    social_provider: Optional[str] = None
    role: str

    class Config:
        # SQLAlchemy 2.0 (Mapped) 모델을 Pydantic으로 자동 변환
        from_attributes = True