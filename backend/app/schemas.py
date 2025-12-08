from __future__ import annotations
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, EmailStr
from datetime import datetime 
from enum import Enum

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
    key_signature: Optional[str] = "Neutral"
    vocals_allowed: Optional[bool] = False
    include_instruments: Optional[list[str]] = []
    exclude_instruments: Optional[list[str]] = []
    duration_sec: Optional[int] = 120
    notes: Optional[str] = None
    
    harmonic_dissonance: Optional[str] = "Neutral"
    rhythm_complexity: Optional[str] = "Neutral"
    melody_contour: Optional[str] = "Neutral"
    texture_density: Optional[str] = "Neutral"
    mainInstrument: Optional[str] = "Piano" 

    anxiety: Optional[int] = None
    depression: Optional[int] = None
    pain: Optional[int] = None
    
    class Config:
        from_attributes = True

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
    name: str
    role: str = Field(..., pattern="^(patient|therapist)$", description="Role must be 'patient' or 'therapist'")
    
class CounselorCreatePatientRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str
    age: Optional[int] = None

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
    name: Optional[str] = None
    age: Optional[int] = None

    class Config:
        # SQLAlchemy 2.0 (Mapped) 모델을 Pydantic으로 자동 변환
        from_attributes = True

    # 1. /sessions/my API가 반환할 데이터 모양 정의
class SessionInfo(BaseModel):
    id: int
    created_at: datetime
    # 필요하다면 Session 모델의 다른 필드도 추가 가능 (예: status: str | None = None)

    class Config:
        from_attributes = True # SQLAlchemy 모델 -> Pydantic 자동 변환 (orm_mode = True for Pydantic v1)

# 2. /music/my API가 반환할 데이터 모양 정의
class MusicTrackInfo(BaseModel):
    id: int # Track 모델의 id
    title: str # 프론트엔드에서 사용할 제목 (music.py에서 생성 필요)
    prompt: str # 프론트엔드에서 사용할 프롬프트 (music.py에서 생성 필요)
    track_url: Optional[str] = Field(None, alias="audioUrl")
    # 필요하다면 Track 모델의 다른 필드도 추가 가능 (예: created_at: datetime)

    session_id: int
    initiator_type: Optional[str] = None
    has_dialog: Optional[bool] = False # 👈 patient_intake.has_dialog
    
    created_at: Optional[datetime] = None
    is_favorite: bool = False

    class Config:
        from_attributes = True # SQLAlchemy 모델 -> Pydantic 자동 변환
        
class UserProfile(BaseModel):
    """
    사용자 프로필 조회 (/user/profile) 응답 스키마
    """
    id: int
    name: Optional[str] = None
    age: Optional[int] = None
    email: Optional[EmailStr] = None
    role: str

    class Config:
        from_attributes = True

class ProfileUpdate(BaseModel):
    """
    사용자 프로필 업데이트 (/user/profile) 요청 스키마
    """
    name: str = Field(..., min_length=1, description="이름은 비워둘 수 없습니다.")
    age: Optional[int] = Field(None, gt=0, lt=150, description="나이는 1세 이상 150세 미만이어야 합니다.")

# --- 연결 관리 ---
class ConnectionDetail(BaseModel):
    """
    연결 요청 상세 정보 스키마 (option 페이지의 '연결요청' 탭)
    """
    connection_id: int
    therapist_id: int
    therapist_name: str
    status: str # 'PENDING', 'ACCEPTED', 'REJECTED'
    
    class Config:
        from_attributes = True

class ConnectionResponse(str, Enum):
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"

class ConnectionRespondReq(BaseModel):
    connection_id: int
    response: Literal["ACCEPTED", "REJECTED"]
    
class SocialRegisterRequest(BaseModel):
    temp_token: str # 카카오 정보가 담긴 임시 토큰
    role: str = "patient" # 사용자가 선택한 역할
    name: str

# 💡 [선택적 수정] /auth/kakao가 두 가지 응답을 보낼 수 있음을 명시
class KakaoLoginResponse(BaseModel):
    status: str # "success" (로그인) 또는 "register_required" (회원가입)
    access_token: Optional[str] = None
    temp_token: Optional[str] = None
    
class FoundPatientResponse(BaseModel):
    id: int
    name: Optional[str] = None
    email: Optional[str] = None
    connection_status: Literal['available', 'pending', 'connected_to_self', 'connected_to_other']

    class Config:
        from_attributes = True

# 💡 [핵심 추가 1] 상담사 통계 API 응답 스키마
class CounselorStats(BaseModel):
    total_patients: int
    total_music_tracks: int

# 💡 [핵심 추가 2] 상담사 최근 음악 API 응답 스키마
class RecentMusicTrack(BaseModel):
    music_id: int | str
    music_title: str
    patient_id: int | str
    patient_name: str | None
    
    session_id: int
    initiator_type: Optional[str] = None
    has_dialog: Optional[bool] = False

    created_at: Optional[datetime] = None
    is_favorite: bool = False
    class Config:
        from_attributes = True

class SimpleIntakeData(BaseModel):
    goal_text: Optional[str] = None
    vas: Optional[Dict[str, Any]] = None
    prefs: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True

# 💡 [핵심 추가] 채팅 메시지 스키마
class SimpleChatMessage(BaseModel):
    id: int
    role: str
    content: str

    class Config:
        from_attributes = True

# 💡 [핵심 추가] 음악 '상세' 정보 응답 스키마
class MusicTrackDetail(MusicTrackInfo):
    lyrics: Optional[str] = None
    intake_data: Optional[SimpleIntakeData] = None # (환자 접수용)
    therapist_manual: Optional[TherapistManualInput] = None # 👈 [추가] (처방/작곡용)
    chat_history: List[SimpleChatMessage] = []
# 💡 [핵심 추가] 프로필 '수정' 시 받을 데이터 스키마
class UserUpdate(BaseModel):
    # (name은 수정 불가로 가정, age만 받음)
    age: Optional[int] = None
    # (만약 dob(생년월일)을 사용 중이라면 age 대신 dob: Optional[date] = None)

class PatientInfoWithStats(UserPublic):
    # (UserPublic의 id, name, email, role, dob 등을 상속받음)
    total_sessions: int
    total_music_tracks: int

class NoteBase(BaseModel):
    content: str = Field(..., min_length=1)

class NoteCreate(NoteBase):
    pass # patient_id는 URL에서, therapist_id는 인증에서 받음

class NoteUpdate(NoteBase):
    pass

class NotePublic(NoteBase):
    id: int
    patient_id: int
    therapist_id: int
    created_at: datetime
    updated_at: datetime
    therapist_name: Optional[str] = None

    class Config:
        from_attributes = True

class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1)

class CommentResponse(BaseModel):
    id: int
    content: str
    author_name: str
    author_role: str
    author_id: int
    created_at: datetime
    class Config:
        from_attributes = True

class PostCreate(BaseModel):
    title: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    track_id: Optional[int] = None 
    tags: Optional[List[str]] = []

# 💡 [핵심 추가] 게시판용 간단 트랙 정보 (MusicTrackInfo 대신 사용)
class BoardTrackInfo(BaseModel):
    id: int
    title: str
    audioUrl: str # track_url 값을 여기로 매핑
    
    class Config:
        from_attributes = True

class PostResponse(BaseModel):
    id: int
    title: str
    content: str
    author_name: str
    author_role: str 
    author_id: int
    created_at: datetime
    # 💡 [수정] MusicTrackInfo -> BoardTrackInfo (단순화)
    track: Optional[BoardTrackInfo] = None 
    comments_count: int = 0
    views: int = 0
    tags: Optional[List[str]] = []
    like_count: int = 0
    is_liked: bool = False

    class Config:
        from_attributes = True

class PostDetailResponse(PostResponse):
    comments: List[CommentResponse] = []

class TrackUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=50)

class MessageCreate(BaseModel):
    receiver_id: int
    content: str

class MessageResponse(BaseModel):
    id: int
    content: str
    sender_id: int
    receiver_id: int
    created_at: datetime
    is_read: bool
    class Config:
        from_attributes = True

# 대화 상대방 정보 (목록용)
class ChatPartner(BaseModel):
    user_id: int
    name: str
    role: str
    unread_count: int
    last_message: Optional[str] = None
    last_message_time: Optional[datetime] = None

# 💡 [신규] 연결 요청 스키마 (ID 또는 이메일)
class ConnectionRequest(BaseModel):
    target_id: Optional[int] = None
    email: Optional[str] = None

# 💡 [신규] 통합 연결 정보 스키마 (마이페이지 리스트용)
class ConnectionInfo(BaseModel):
    connection_id: int
    partner_id: Optional[int]
    partner_name: str
    partner_email: Optional[str]
    partner_role: str
    status: str
    created_at: Optional[str]
    is_sender: Optional[bool] = False 

    class Config:
        from_attributes = True

class UserPasswordUpdate(BaseModel):
    current_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8)