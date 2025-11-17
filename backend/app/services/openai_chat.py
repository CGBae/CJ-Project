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
    "mood": "대화에서 파악된 가장 지배적인 심리적 분위기 (예: calming, exciting, melancholic, energizing)",
    "keywords": "음악 생성에 사용될 수 있는 5개 이내의 핵심 심리/음악 키워드 (예: piano, ambient, deep, slow, hopeful)",
    "target": "환자가 궁극적으로 개선하려 하거나 호소하는 증상 (예: anxiety, depression, insomnia, pain)",
    "music_constraints": "환자가 대화 중 명시적으로 요구하거나 '싫다'고 말한 음악적 요소 (예: 'no piano', 'no drums', 'fast tempo', 'slow tempo dislike')",
    "confidence": "분석 결과의 신뢰도 (0.0~1.0 사이의 float 값)"
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
        return {"mood": "calming", "keywords": [], "target": "n/a", "constraints": None, "confidence": 0.0}
    except (json.JSONDecodeError, IndexError, AttributeError, TypeError) as e:
        print(f"OpenAI Response Parse Error (falling back to default): {e}")
        return {"mood": "calming", "keywords": [], "target": "n/a", "constraints": None, "confidence": 0.0}