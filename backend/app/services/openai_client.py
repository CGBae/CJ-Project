from __future__ import annotations
import os, asyncio, json
from typing import List, Dict, Any
from openai import OpenAI, APIConnectionError, RateLimitError, OpenAIError

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
TIMEOUT = float(os.getenv("OPENAI_TIMEOUT_S", "15"))

_client = OpenAI()  # OPENAI_API_KEY는 env로 자동 로딩

SYSTEM_BASE = (
    "당신은 환자의 심리 상태에 맞춰 음악 프롬프트와 가사를 동시에 생성하는 전문 AI입니다. "
    "아래 지시를 따르세요: "
    "1) 출력은 '오직 하나의 JSON 객체'만. 설명이나 추가 텍스트 금지. "
    "2) JSON은 반드시 'music_prompt'와 'lyrics_text' 두 필드를 포함해야 합니다. "
    "3) 'music_prompt'는 ElevenLabs Music API용으로, 다음 **모든 핵심 요소들을 필수적으로 포함**해야 합니다. 환자 데이터(Goal, Prefs, Dialog)와 가이드라인(규칙)을 종합하여 구체적인 값으로 추론하세요:\n"
    "   - **장르/분위기 (Genre/Mood)**: 환자의 목표 및 선호 장르를 반영 (예: 'Ambient track', 'Lofi Hip-Hop')\n"
    "   - **주요/배제 악기 (Instruments/Exclusions)**: 선호/금기 사항을 반영 (예: 'featuring soft piano', 'without drums or sharp strings')\n"
    "   - **목표 분위기 설명 (Goal-Atmosphere)**: 환자의 목표(VAS/Goal)에 맞는 구체적 정서 묘사 (예: 'creating a focus-enhancing atmosphere')\n"
    "   - **BPM (예: '70-75 BPM' 또는 '72 BPM')**\n"
    "   - **Key Signature (예: 'in C minor' 또는 'Key of F major')**\n"
    "   - **Duration (길이) (예: '60 seconds long' 또는 '120 second track')**\n"
    "   - Vocals (가사 포함 지시: 'singing the generated lyrics with X vocals')\n"
    "4) 모든 요소(특히 장르, 악기, 목표 분위기)는 환자의 VAS, 목표, 대화 내용, 그리고 가이드라인(규칙)을 종합하여 **가장 치료 효과가 높은 값으로 추론**해야 합니다. 환자가 대화에서 명시했다면 그 값을 최우선으로 반영하세요.\n"
    "5) 'lyrics_text'는 환자의 상태를 반영한 가사 전문(한국어)이어야 합니다.\n"
    "6) 저작권 침해 표현(특정 아티스트/곡) 금지. "
)

async def generate_prompt_from_guideline(
    guideline_json: str,
    extra_requirements: str,
) -> Dict[str, str]:
    """
    가이드라인과 환자 데이터를 조합하여 JSON 객체를 반환합니다.
    """
    messages = [
        {"role": "system", "content": SYSTEM_BASE},
        {"role": "user", "content":
            f"당신은 [환자 원본 데이터]를 [기본 가이드라인]에 맞춰 해석하고, "
                f"다음 스키마를 따르는 **JSON 객체**를 출력해야 합니다.\n"
                f"JSON 스키마: {{ \"music_prompt\": \"[음악 프롬프트 본문]\", \"lyrics_text\": \"[생성된 가사 전문]\" }}\n"
                f"[환자 원본 데이터]의 모든 뉘앙스(대화 내용)를 **최우선으로 반영**하세요.\n\n"
                f"--- [환자 원본 데이터 (가장 중요)] ---\n{extra_requirements}\n\n"
                f"--- [기본 가이드라인 (규칙)] ---\n{guideline_json}\n\n"
                f"※ 출력은 오직 JSON 객체만. 따옴표/설명 금지."
        }
    ]

    try:
        def _call():
            return _client.responses.create(model=MODEL, input=messages)
        resp = await asyncio.to_thread(_call)
        raw_json_text = resp.output_text.strip()
        
        # ⬇️ JSON 파싱 안정화 로직 추가 (AI가 불필요한 텍스트를 붙여도 JSON만 추출)
        if raw_json_text.startswith("```json"):
            raw_json_text = raw_json_text[7:].strip()
        if raw_json_text.endswith("```"):
            raw_json_text = raw_json_text[:-3].strip()
        
        json_start = raw_json_text.find('{')
        json_end = raw_json_text.rfind('}')
        if json_start != -1 and json_end != -1 and json_end > json_start:
            raw_json_text = raw_json_text[json_start:json_end+1]

        # 파싱된 딕셔너리 반환
        return json.loads(raw_json_text)
        
    except (json.JSONDecodeError, IndexError, AttributeError) as e:
        print(f"OpenAI Response Parse Error: {e}")
        # 파싱 실패 시 기본값 반환 (안정성 확보)
        return {"music_prompt": "calming ambient music, 70 BPM, with gentle instrumental sound.", "lyrics_text": "가사 생성 실패: 시스템 에러로 가사가 생성되지 않았습니다."}
    except (RateLimitError, APIConnectionError, OpenAIError) as e:
        raise RuntimeError(f"OpenAI error: {e}")
