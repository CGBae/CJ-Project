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

    "[추가 지시문: 장르 정의]\n"
    "환자가 선호/비선호하는 장르를 음악 프롬프트에 반영할 때, 다음 정의를 참고하여 음악 치료 목적에 맞게 변환해야 합니다:\n"
    "- \"클래식 (Classic)\": 오케스트라, 피아노, 현악기 중심. 안정적이고 구조적.\n"
    "- \"재즈 (Jazz)\": 스윙 리듬, 브라스, 피아노. 편안하거나(Lounge) 복잡할(Bebop) 수 있음.\n"
    "- \"발라드 (Ballad)\": 느린 템포, 감성적인 보컬/멜로디. 주로 피아노나 기타 반주.\n"
    "- \"팝 (Pop)\": 대중적이고 따라 부르기 쉬운 멜로디, 밝은 분위기.\n"
    "- \"락 (Rock)\": 일렉트릭 기타, 드럼, 베이스 중심. 강한 에너지 또는 감성적일 수 있음.\n"
    "- \"힙합 (Hip-hop)\": 리드미컬한 드럼 비트, 랩 또는 보컬.\n"
    "- \"R&B\": 그루브한 리듬, 감성적인 보컬, 부드러운 사운드.\n"
    "- \"EDM\": 전자음악, 댄스 비트. (치료용으로는 Ambient/Chill 계열 추천)\n"
    "- \"뉴에이지 (New Age)\": 명상, 자연의 소리, 신디사이저 패드, 편안한 멜로디.\n"
    "- \"로파이(Lo-fi)\": 힙합 비트 기반, 노이즈, 편안하고(cozy) 차분한(chill) 분위기. 불안 완화에 매우 효과적.\n"
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
            return _client.chat.completions.create(
                model=MODEL,
                messages=messages,
                response_format={"type": "json_object"}, # 👈 JSON 모드 강제 (gpt-4o-mini 지원)
                timeout=TIMEOUT
            )
        resp = await asyncio.to_thread(_call)
        raw_json_text = resp.choices[0].message.content
        if not raw_json_text:
             raise json.JSONDecodeError("OpenAI returned empty content", "", 0)
        
        raw_json_text = raw_json_text.strip()
        
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
