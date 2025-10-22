from __future__ import annotations
import os
import time
from typing import Any, Dict, Optional
import httpx
import asyncio

# .env 파일에 있는 'ELEVEN_API_KEY'를 그대로 사용합니다.
ELEVEN_API_KEY = os.getenv("ELEVEN_API_KEY", "")
BASE = os.getenv("ELEVEN_MUSIC_BASE", "https://api.elevenlabs.io")
# API 경로는 계정에서 지원하는 정확한 경로를 확인해야 합니다.
# Text-to-Sound Effects API 또는 Text-to-Speech API 일 수 있습니다.
# CREATE_PATH = os.getenv("ELEVEN_MUSIC_CREATE", "/v1/text-to-speech/{voice_id}/stream")
CREATE_PATH = "/v1/music/generate"

# 안정적인 목소리 ID 예시 (실제 ElevenLabs 계정에서 확인 필요)
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"

DEFAULT_TIMEOUT = 180.0

class ElevenLabsError(RuntimeError):
    pass

def _headers() -> Dict[str, str]:
    """ElevenLabs API 요청에 필요한 헤더를 생성합니다."""
    if not ELEVEN_API_KEY:
        raise ElevenLabsError("ELEVEN_API_KEY가 .env 파일에 설정되지 않았습니다.")
    
    return {
        "xi-api-key": ELEVEN_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg", # 이제 오디오 파일을 직접 받겠다고 명시합니다.
    }

async def compose_and_save(
    prompt_text: str,
    *,
    music_length_ms: int = 120_000,
    force_instrumental: bool = True,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    """
    ElevenLabs API를 호출하여 오디오를 직접 받아 파일로 저장하고,
    해당 파일의 접근 URL을 반환합니다.
    """
    # Text-to-Speech API를 사용하는 경우, URL에 voice_id가 포함되어야 합니다.
    path = CREATE_PATH.format(voice_id=DEFAULT_VOICE_ID)
    url = f"{BASE.rstrip('/')}{path}"
    
    # ElevenLabs API가 요구하는 payload 형식에 맞춰야 합니다.
    # 아래는 Text-to-Speech API의 예시입니다.
    payload: Dict[str, Any] = {
        "prompt": prompt_text,
        "duration_seconds": int(music_length_ms / 1000), # ms를 초(second)로 변환
        "instrumental": force_instrumental,
    }
    if extra:
        payload.update(extra)

    print(f"ElevenLabs API 호출 시작... URL: {url}")
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        try:
            r = await client.post(url, headers=_headers(), json=payload)
            r.raise_for_status() # 200 OK가 아니면 에러를 발생시킴
        except httpx.HTTPStatusError as e:
             # 에러 응답은 보통 텍스트이므로 .text로 확인
            raise ElevenLabsError(f"API returned status {e.response.status_code}: {e.response.text}") from e
        except Exception as e:
            raise ElevenLabsError(f"API call failed: {e}") from e
    
    # --- 오디오 파일 저장 로직 ---
    # 1. 저장할 폴더가 없으면 만듭니다.
    save_dir = "static/audio"
    os.makedirs(save_dir, exist_ok=True)
    
    # 2. 고유한 파일 이름을 만듭니다.
    file_name = f"music_{int(time.time())}.mp3"
    file_path = os.path.join(save_dir, file_name)
    
    # 3. 응답으로 받은 오디오 데이터(r.content)를 파일에 씁니다.
    with open(file_path, "wb") as f:
        f.write(r.content)
        
    print(f"음악 파일 저장 완료: {file_path}")
    
    # 4. 프론트엔드가 접근할 수 있는 URL 경로를 반환합니다.
    return f"/{save_dir.replace(os.sep, '/')}/{file_name}"