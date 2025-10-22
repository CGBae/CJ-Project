from __future__ import annotations
import os, asyncio, time
from typing import Any, Dict, Optional
import json
import httpx
from httpx import Timeout

ELEVEN_API_KEY = os.getenv("ELEVEN_API_KEY", "")
BASE = os.getenv("ELEVEN_MUSIC_BASE", "https://api.elevenlabs.io")
CREATE_PATH = os.getenv("ELEVEN_MUSIC_CREATE", "/v1/music/tasks")
STATUS_PATH_TPL = os.getenv("ELEVEN_MUSIC_STATUS", "/v1/music/tasks/{task_id}")
DOWNLOAD_FIELD = os.getenv("ELEVEN_MUSIC_DOWNLOAD_FIELD", "audio_url")

DEFAULT_TIMEOUT = Timeout(10.0, read=300.0)
POLL_INTERVAL_SEC = 2.5
POLL_TIMEOUT_SEC = 120.0   # 전체 대기 최대(필요시 늘려)

class ElevenLabsError(RuntimeError):
    pass

def _headers() -> Dict[str, str]:
    if not ELEVEN_API_KEY:
        raise ElevenLabsError("ELEVEN_API_KEY is not set")
    
    key = ELEVEN_API_KEY.replace("Bearer ", "").strip().strip('"').strip("'")
    
    return {
        "xi-api-key": key,
        "Content-Type": "application/json",
    }
    # return {
    #     "Authorization": f"Bearer {ELEVEN_API_KEY}",
    #     "Content-Type": "application/json",
    # }

async def create_music_job(
    prompt_text: str,
    *,
    music_length_ms: int = 120_000,
    force_instrumental: bool = True,
    composition_plan: Optional[Dict[str, Any]] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    """
    프롬프트 텍스트로 생성 작업을 등록하고 task_id(또는 job_id)를 반환.
    실제 파라미터/필드명은 계정 문서에 맞춰 extra로 보강 가능.
    """
    url = f"{BASE.rstrip('/')}{CREATE_PATH}"
    payload: Dict[str, Any] = {
        "prompt": prompt_text,
        "music_length_ms": music_length_ms,
        "force_instrumental": force_instrumental,
    }
    if composition_plan:
        payload["composition_plan"] = composition_plan
    if extra:
        payload.update(extra)

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        r = await client.post(url, headers=_headers(), json=payload)
        if r.status_code >= 400:
            raise ElevenLabsError(f"create failed {r.status_code}: {r.text}")
        try:
            data = r.json()
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            # 2xx 응답을 받았지만 JSON이 아닌 경우
            raise ElevenLabsError(
                f"Failed to decode JSON response (Error: {e}). "
                f"Status code was {r.status_code}. "
                f"Response text: {r.text!r}"  # !r로 원본 텍스트 출력
            )
        # 문서에 따라 'task_id' / 'job_id' / 'id' 등 다를 수 있음
        task_id = data.get("task_id") or data.get("job_id") or data.get("id")
        if not task_id:
            raise ElevenLabsError(f"no task id in response: {data}")
        return task_id

async def poll_music_url(task_id: str) -> Optional[str]:
    """
    작업 상태를 조회하여 재생 가능한 URL을 얻으면 반환.
    아직이면 None 반환.
    """
    path = STATUS_PATH_TPL.format(task_id=task_id)
    url = f"{BASE.rstrip('/')}{path}"
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        r = await client.get(url, headers=_headers())
        if r.status_code >= 400:
            raise ElevenLabsError(f"status failed {r.status_code}: {r.text}")
        data = r.json()
        # 문서에 따라 status/progress/urls 구조가 다를 수 있음
        status = (data.get("status") or "").lower()
        # 완료 시 URL 획득(필드명 가변)
        if status in ("ready", "completed", "succeeded", "finished"):
            url = data.get(DOWNLOAD_FIELD) or data.get("audio", {}).get("url") or data.get("result_url")
            return url
        elif status in ("failed", "error"):
            raise ElevenLabsError(f"task failed: {data}")
        return None
    
async def get_task_status(task_id: str) -> Dict[str, Any]:
    """(새 함수) task_id로 작업 상태를 폴링하는 헬퍼 함수"""
    url = f"{BASE.rstrip('/')}{STATUS_PATH_TPL.format(task_id=task_id)}"
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=_headers())
        if r.status_code >= 400:
            raise ElevenLabsError(f"status check failed {r.status_code}: {r.text}")
        return r.json()

async def compose_and_wait(
    prompt_text: str,
    *,
    music_length_ms: int = 120_000,
    force_instrumental: bool = True,
    composition_plan: Optional[Dict[str, Any]] = None,
    extra: Optional[Dict[str, Any]] = None,
    max_wait_sec: float = POLL_TIMEOUT_SEC,
) -> str:
    """
    음악 생성을 (비동기) 요청하고, 완료될 때까지 폴링(대기)한 뒤,
    최종 오디오 URL을 반환합니다.
    """
    task_id = await create_music_job(
        prompt_text,
        music_length_ms=music_length_ms,
        force_instrumental=force_instrumental,
        composition_plan=composition_plan,
        extra=extra,
    )
    # 폴링
    while True:
        status_data = await get_task_status(task_id)
        
        status = status_data.get("status")
        
        if status == "completed" or status == "success":
            # 3. 완료 시, DOWNLOAD_FIELD(audio_url)를 찾아 반환
            track_url = status_data.get(DOWNLOAD_FIELD)
            if not track_url:
                raise ElevenLabsError(f"Task completed but no audio URL found in '{DOWNLOAD_FIELD}' field: {status_data}")
            return track_url
        
        elif status == "failed" or status == "error":
            raise ElevenLabsError(f"Music generation failed: {status_data.get('error_message', status_data)}")
        
        # 'pending', 'processing' 등인 경우 5초 대기
        await asyncio.sleep(5)
