from __future__ import annotations
import os, asyncio
from typing import List, Dict, Any
from openai import OpenAI, APIConnectionError, RateLimitError, OpenAIError

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
TIMEOUT = float(os.getenv("OPENAI_TIMEOUT_S", "15"))

_client = OpenAI()  # OPENAI_API_KEY는 env로 자동 로딩

SYSTEM_BASE = (
    "당신은 ElevenLabs Music API를 위한 전문 프롬프트 엔지니어입니다. "
    "아래 지시를 따르세요: "
    "1) 출력은 '단 하나의 텍스트 프롬프트 본문'만. "
    "2) 저작권 침해 표현(특정 아티스트/곡/가사) 금지. "
    "3) 모호어 금지, 구체적 음악 용어 사용. "
    "4) 필수: 장르/분위기/BPM/키/주요·배제 악기/가사유무/길이/안전규칙."
)

async def generate_prompt_from_guideline(
    guideline_json: str,
    extra_requirements: str,
) -> str:
    """
    'guideline_json'(규칙)과 'extra_requirements'(환자 원본 데이터)를 조합하여
    '단일 텍스트 프롬프트'를 생성.
    """
    messages = [
        {"role": "system", "content": SYSTEM_BASE},
        {"role": "user", "content":
            f"당신은 [환자 원본 데이터]를 [기본 가이드라인]에 맞춰 해석하고, "
                f"ElevenLabs Music API용 '단 하나의 텍스트 프롬프트 본문'을 생성해야 합니다.\n"
                f"[환자 원본 데이터]의 모든 뉘앙스(특히 '전체 대화 내용')를 **최우선으로 반영**하세요.\n\n"
                f"--- [환자 원본 데이터 (가장 중요)] ---\n{extra_requirements}\n\n"
                f"--- [기본 가이드라인 (규칙)] ---\n{guideline_json}\n\n"
                f"※ 출력은 프롬프트 본문만. 따옴표/설명 금지."
        }
    ]

    try:
        # Responses API (sync 함수이므로 스레드풀로 감싸 비동기화)
        def _call():
            return _client.responses.create(model=MODEL, input=messages)
        resp = await asyncio.to_thread(_call)
        return resp.output_text.strip()
    except (RateLimitError, APIConnectionError, OpenAIError) as e:
        raise RuntimeError(f"OpenAI error: {e}")  # 상위에서 폴백/처리
