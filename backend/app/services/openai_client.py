from __future__ import annotations
import os, asyncio, json
from typing import List, Dict, Any
from openai import OpenAI, APIConnectionError, RateLimitError, OpenAIError

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
TIMEOUT = float(os.getenv("OPENAI_TIMEOUT_S", "15"))

_client = OpenAI()  # OPENAI_API_KEY는 env로 자동 로딩

SYSTEM_BASE = (
    "당신은 상담 대화와 설문, 기본 가이드라인을 바탕으로 "
    "환자 맞춤 음악 프롬프트와 가사를 생성하는 AI입니다.\n"
    "\n"
    "규칙의 우선순위는 다음과 같습니다:\n"
    "1) 안전 규칙과 하드 제약(HARD CONSTRAINTS 섹션에 명시된 내용)을 절대 위반하지 않을 것.\n"
    "2) 그 다음으로 환자의 상태/목표, 상담에서 추출된 mood/keywords를 반영할 것.\n"
    "3) 그 다음으로 storyline, imagery, quote_like_phrase를 활용하여 "
    "음악의 장면과 가사를 풍부하게 만들 것.\n"
    "\n"
    "특히 HARD CONSTRAINTS 섹션에 악기/장르/보컬 관련 금지 사항이 있을 경우:\n"
    "- 예: 'no piano'가 있다면, music_prompt에서 piano를 포함하거나 암시하는 표현을 절대 사용하지 마세요.\n"
    "- 예: 'Instrumental only'가 있다면, lyrics_text는 생성하더라도 "
    "music_prompt에는 보컬을 재생하라는 지시를 넣지 마세요.\n"
    "\n"
    "출력 형식:\n"
    "- 오직 하나의 JSON 객체만 출력합니다.\n"
    "- JSON에는 반드시 두 개의 필드만 포함합니다: \"music_prompt\", \"lyrics_text\".\n"
    "- JSON 앞뒤에는 어떠한 설명, 마크다운, 코드블록, 주석도 쓰지 마세요.\n"
    "\n"
    "\"music_prompt\" 작성 지침:\n"
    "- ElevenLabs Music API에 사용할 자연어 프롬프트로, 다음 요소들을 모두 포함해야 합니다.\n"
    "  * 장르/분위기 (예: \"calming ambient\", \"hopeful lofi hip-hop\")\n"
    "  * 주요 악기와 배제 악기 (예: \"soft pads and warm textures, without piano\")\n"
    "  * 하드 제약(HARD CONSTRAINTS)의 내용을 명시적으로 반영할 것\n"
    "  * 장면/스토리 기반 분위기 설명 (예: \"비 오는 퇴근길 버스 안에서 서서히 안정을 되찾는 느낌\")\n"
    "  * BPM 범위 또는 단일 값 (예: \"around 70 BPM\", \"90–100 BPM\")\n"
    "  * 조성 (예: \"in C major\", \"in A minor\")\n"
    "  * 곡 길이 (예: \"about 60 seconds long\")\n"
    "  * 보컬/가사 사용 여부 (예: \"instrumental only\" 또는 "
    "\"softly singing the generated Korean lyrics\")\n"
    "\n"
    "\"lyrics_text\" 작성 지침:\n"
    "- 한국어 가사 전체를 포함해야 합니다.\n"
    "- 환자의 상태와 목표, 그리고 storyline/imagery를 시나리오처럼 담아야 합니다.\n"
    "- quote_like_phrase가 주어졌다면, 의미를 유지한 채 자연스럽게 "
    "가사 속 한 줄로 재구성해서 넣으세요 (직접 인용이 아니어도 됨).\n"
    "- 자해, 자살, 타인 공격, 과도한 선정성, 차별 표현은 피하고, "
    "위로와 안정, 희망을 주는 방향으로 작성합니다.\n"
    "- 기존 곡/아티스트/브랜드명을 직접 언급하거나 모방을 지시하는 표현은 사용하지 마세요.\n"

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
    가이드라인(JSON)과 환자 데이터(extra_requirements)를 조합하여
    {\"music_prompt\": ..., \"lyrics_text\": ...} 형태의 JSON 객체를 반환한다.

    extra_requirements 문자열 안에는 다음과 같은 섹션이 포함될 수 있다:
      - === HARD CONSTRAINTS (절대 위반 금지) ===
      - === PATIENT STATE & STORY ===
    """
    messages = [
        {"role": "system", "content": SYSTEM_BASE},
        {
            "role": "user",
            "content": (
                "다음은 한 환자에 대한 원본 정보입니다.\n"
                "특히 '=== HARD CONSTRAINTS (절대 위반 금지) ===' 섹션에 있는 내용은 "
                "악기/장르/보컬에 대한 금기 사항이므로 절대 위반해서는 안 됩니다.\n"
                "그 아래 '=== PATIENT STATE & STORY ===' 섹션에는 "
                "환자의 현재 상태, 상담 목표, storyline, imagery, quote_like_phrase 등이 포함되어 있습니다.\n"
                "이 정보를 최우선으로 사용하여, 음악이 표현해야 할 정서와 스토리를 이해하세요.\n\n"
                "--- [환자 원본 데이터] ---\n"
                f"{extra_requirements}"
            ),
        },
        {
            "role": "user",
            "content": (
                "아래는 JSON 형식의 기본 음악 치료 가이드라인입니다.\n"
                "이 가이드라인을 위의 [환자 원본 데이터]와 결합하여, "
                "SYSTEM 메시지에서 설명한 규칙(특히 HARD CONSTRAINTS 우선순위)을 지키는 "
                "\"music_prompt\"와 \"lyrics_text\"를 생성하는 하나의 JSON 객체를 출력하세요.\n\n"
                "--- [기본 가이드라인 (규칙)] ---\n"
                f"{guideline_json}\n\n"
                "※ 중요한 조건:\n"
                "- 출력은 오직 JSON 객체 한 개만.\n"
                "- 마크다운, 코드블록, 자연어 설명, 주석 등을 절대 포함하지 마세요."
            ),
        },
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
        return {"music_prompt": "calming ambient music, 70 BPM, gentle pads and soft textures, "
                            "creating a safe and soothing emotional space.",
            "lyrics_text": "가사 생성 실패: 시스템 에러로 가사가 생성되지 않았습니다.",
        }
    except (RateLimitError, APIConnectionError, OpenAIError) as e:
        raise RuntimeError(f"OpenAI error: {e}")
