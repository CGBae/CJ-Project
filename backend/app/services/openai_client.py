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
    긴 JSON 가이드라인을 '기본 템플릿'으로, 
    extra_requirements를 '가장 중요한 환자 맞춤형 수정사항'으로 삼아
    '단일 텍스트 프롬프트'를 생성. 실패 시 예외 발생.
    """
    messages = [
        {"role": "system", "content": SYSTEM_BASE},
        {"role": "user", "content":
            f"다음 [환자 맞춤형 요구사항]은 환자의 현재 상태를 반영하는 가장 중요한 정보입니다.\n"
                f"이 요구사항을 **최우선으로 반영**하여, 아래의 [기본 가이드라인]을 **수정하고 보완**하세요.\n"
                f"최종 결과물은 ElevenLabs Music API용 '단 하나의 텍스트 프롬프트 본문'만 생성하세요.\n\n"
                f"--- [환자 맞춤형 요구사항 (가장 중요)] ---\n{extra_requirements}\n\n"
                f"--- [기본 가이드라인 (템플릿)] ---\n{guideline_json}\n\n"
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
