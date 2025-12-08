from __future__ import annotations
import os, asyncio, json
from typing import List, Dict, Any
from openai import OpenAI, APIConnectionError, RateLimitError, OpenAIError
from app.config import THERAPEUTIC_SYSTEM_PROMPT

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
TIMEOUT = float(os.getenv("OPENAI_TIMEOUT_S", "15")) # 💡 [추가] 타임아웃
_client = OpenAI()

ANALYSIS_SYSTEM_PROMPT = (
    "당신은 심리 치료 대화 분석 전문가입니다. 환자와 어시스턴트 간의 대화 내용을 분석하여 "
    "환자의 현재 심리 상태, 필요 키워드, 주 호소 목표를 파악하고, 분석 결과를 '오직 JSON' 형식으로만 출력하세요. "
    "절대 설명이나 추가 텍스트를 붙이지 마세요."
)
ANALYSIS_GUIDELINE = {
    "mood": "대화 전체를 관통하는 전반적인 정서(예: 'calming', 'hopeful', 'nostalgic' 등 영어 한 단어)",
    "keywords": "음악이 표현해야 할 핵심 감정/상황 키워드 3~7개를 영어 단어 리스트로",
    "target": "상담의 궁극적인 목표를 한국어 한 문장으로",
    "music_constraints": "사용자가 명시적으로 언급한 음악 관련 선호/금기 사항을 영어로 한 문장으로 (없으면 빈 문자열)",
    "storyline": "대화 내용을 바탕으로, 음악이 표현해야 할 장면/스토리를 한국어로 2~3문장으로 요약",
    "imagery": "사용자가 언급한 인상적인 이미지/장소/상징(예: '비 오는 버스', '야근 후 야간 도로')를 한국어 짧은 문구 3개 이내 리스트로",
    "quote_like_phrase": "대화에서 중요한 의미를 가진 사용자의 표현을 안전하게 재구성한 한국어 문장 1개 (민감한 개인정보는 제거)",
    "confidence": "0.0 ~ 1.0 사이의 float"
}
def _messages_for_openai(system_prompt: str, history: List[Dict[str,str]]):
    messages = [{"role":"system", "content": system_prompt}]
    MAX_TURNS = 12 
    truncated = history[-(MAX_TURNS*2):]
    messages.extend(truncated)
    return messages

# 💡 1. [핵심 수정] chat_complete (AI 상담사) -> 최신 SDK V1.x로 수정
async def chat_complete(history: List[Dict[str,str]], *, system_prompt: str = THERAPEUTIC_SYSTEM_PROMPT) -> str:
    def _call():
        # 💡 [수정] responses.create -> chat.completions.create
        return _client.chat.completions.create(
            model=MODEL,
            messages=_messages_for_openai(system_prompt, history), # 👈 [수정] input -> messages
            timeout=TIMEOUT
        )
    resp = await asyncio.to_thread(_call)
    # 💡 [수정] output_text -> choices[0].message.content
    return resp.choices[0].message.content.strip()

async def analyze_dialog_for_mood(history: List[Dict[str,str]]) -> Dict[str, Any]:
    """
    (수정됨) 대화 기록을 기반으로 심리 상태를 분석하여 structured JSON(Dict)을 반환.
    """
    # 💡 [수정] history가 비어있어도(Intake 정보만 있어도) 분석 시도
    # if not history:
    #     return {"mood": "calming", "keywords": [], "target": "n/a", "confidence": 0.0}
    dialog_text = "\n".join([f"[{m['role'].capitalize()}]: {m['content']}" for m in history])

    user_prompt = (
        f"다음 대화를 분석하고, 다음 JSON 스키마를 따르는 JSON 객체만 출력하세요.\n"
        f"(대화 내용이 없다면 '사전 접수 내용'만이라도 분석하세요.)\n\n"
        f"[분석 대상 대화 및 접수 내용]\n---\n{dialog_text}\n---\n\n"
        f"[JSON 스키마 (필수)]\n{json.dumps(ANALYSIS_GUIDELINE, indent=2)}\n" # 👈 'constraints'가 포함된 새 스키마
        f"※ 출력은 프롬프트 본문만. 따옴표/설명 금지. JSON만 출력해야 합니다."
    )
    messages = [
        {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt}
    ]

    try:
        def _call():
            return _client.chat.completions.create(
                model=MODEL,
                messages=messages,
                response_format={"type": "json_object"}, 
                timeout=TIMEOUT
            )
        resp = await asyncio.to_thread(_call) 
        raw_json_text = resp.choices[0].message.content
        if not raw_json_text:
             raise json.JSONDecodeError("OpenAI returned empty content", "", 0)
        raw_json_text = raw_json_text.strip()
        
        parsed_json = json.loads(raw_json_text)
        # 💡 [추가] music_constraints 필드가 없으면 기본값 추가
        if 'music_constraints' not in parsed_json:
            parsed_json['music_constraints'] = None
            
        return parsed_json
        
    except (RateLimitError, APIConnectionError, OpenAIError) as e:
        print(f"OpenAI Analysis Error (falling back to default): {e}")
        return {"mood": "calming", "keywords": [], "target": "n/a", "music_constraints": None, "confidence": 0.0}
    except (json.JSONDecodeError, IndexError, AttributeError, TypeError) as e:
        print(f"OpenAI Response Parse Error (falling back to default): {e}")
        return {"mood": "calming", "keywords": [], "target": "n/a", "music_constraints": None, "confidence": 0.0}