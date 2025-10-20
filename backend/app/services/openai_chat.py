from __future__ import annotations
import os, asyncio, json
from typing import List, Dict, Any
from openai import OpenAI, APIConnectionError, RateLimitError, OpenAIError
from app.config import THERAPEUTIC_SYSTEM_PROMPT

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
_client = OpenAI()

ANALYSIS_SYSTEM_PROMPT = (
    "당신은 심리 치료 대화 분석 전문가입니다. 환자와 어시스턴트 간의 대화 내용을 분석하여 "
    "환자의 현재 심리 상태, 필요 키워드, 주 호소 목표를 파악하고, 분석 결과를 '오직 JSON' 형식으로만 출력하세요. "
    "절대 설명이나 추가 텍스트를 붙이지 마세요."
)
ANALYSIS_GUIDELINE = {
    "mood": "대화에서 파악된 가장 지배적인 심리적 분위기 (예: calming, exciting, melancholic, energizing)",
    "keywords": "음악 생성에 사용될 수 있는 5개 이내의 핵심 심리/음악 키워드 (예: piano, ambient, deep, slow, hopeful)",
    "target": "환자가 궁극적으로 개선하려 하거나 호소하는 증상 (예: anxiety, depression, insomnia, pain)",
    "confidence": "분석 결과의 신뢰도 (0.0~1.0 사이의 float 값)"
}

def _messages_for_openai(system_prompt: str, history: List[Dict[str,str]]):
    # history = [{"role":"user","content":"..."}, {"role":"assistant","content":"..."}...]
    messages = [{"role":"system", "content": system_prompt}]
    # 너무 길면 최근 N개만 유지 (토큰 보호)
    MAX_TURNS = 12  # user/assistant 페어 기준
    truncated = history[-(MAX_TURNS*2):]
    messages.extend(truncated)
    return messages

async def chat_complete(history: List[Dict[str,str]], *, system_prompt: str = THERAPEUTIC_SYSTEM_PROMPT) -> str:
    def _call():
        return _client.responses.create(
            model=MODEL,
            input=_messages_for_openai(system_prompt, history)
        )
    resp = await asyncio.to_thread(_call)
    return resp.output_text.strip()

async def analyze_dialog_for_mood(history: List[Dict[str,str]]) -> Dict[str, Any]:
    """
    대화 기록을 기반으로 심리 상태를 분석하여 structured JSON(Dict)을 반환.
    OpenAI 호출 실패 시 폴백 값을 반환합니다.
    """
    # 챗봇 대화 기록이 없으면 기본값 반환
    if not history:
        return {"mood": "calming", "keywords": [], "target": "n/a", "confidence": 0.0}

    # 대화 기록을 분석 요청용 텍스트로 포맷팅
    dialog_text = "\n".join([f"[{m['role'].capitalize()}]: {m['content']}" for m in history])

    user_prompt = (
        f"다음 대화를 분석하고, 다음 JSON 스키마를 따르는 JSON 객체만 출력하세요.\n\n"
        f"[분석 대상 대화]\n---\n{dialog_text}\n---\n\n"
        f"[JSON 스키마 (필수)]\n{json.dumps(ANALYSIS_GUIDELINE, indent=2)}\n"
        f"※ 출력은 프롬프트 본문만. 따옴표/설명 금지. JSON만 출력해야 합니다."
    )
    messages = [
        {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt}
    ]

    try:
        def _call():
            # 🚨 주의: JSON 응답을 강제하는 'response_format'은 'chat.completions.create'에만 지원됩니다.
            # 하지만 현재 파일은 'responses.create'를 사용하므로, 응답 형식을 강제하기 어렵습니다.
            # 일단 'responses.create'를 유지하고 프롬프트로 JSON 응답을 유도합니다.
            return _client.responses.create(
                model=MODEL,
                input=messages,
                # response_format={"type": "json_object"} # responses.create에는 미지원
            )
        resp = await asyncio.to_thread(_call) 
        raw_json_text = resp.output_text.strip()
        
        # JSON 파싱 시도
        return json.loads(raw_json_text)
        
    except (RateLimitError, APIConnectionError, OpenAIError) as e:
        print(f"OpenAI Analysis Error (falling back to default): {e}")
        # API 오류 시 안전한 폴백 값 반환
        return {"mood": "calming", "keywords": [], "target": "n/a", "confidence": 0.0}
    except (json.JSONDecodeError, IndexError, AttributeError) as e:
        print(f"OpenAI Response Parse Error (falling back to default): {e}")
        # 응답이 유효한 JSON이 아닐 경우 안전한 폴백 값 반환
        return {"mood": "calming", "keywords": [], "target": "n/a", "confidence": 0.0}