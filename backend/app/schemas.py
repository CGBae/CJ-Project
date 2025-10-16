from __future__ import annotations
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

# 공통
class SessionCreateResp(BaseModel):
    session_id: int
    status: str = "QUEUED"

# 환자 흐름
class PatientIntake(BaseModel):
    vas: Optional[Dict[str, int]] = None
    prefs: Optional[Dict[str, Any]] = None
    goal: Optional[Dict[str, int]] = None
    dialog: Optional[List[Dict[str,str]]] = None  # [{role, content}...]

class PatientAnalyzeReq(BaseModel):
    session_id: int
    guideline_json: str

class PromptResp(BaseModel):
    session_id: int
    prompt_text: str

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
