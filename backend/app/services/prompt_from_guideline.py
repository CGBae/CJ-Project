from __future__ import annotations
from typing import Dict, Any, List

def build_extra_requirements_for_patient(
    vas: Dict[str,int]|None,
    prefs: Dict[str,Any]|None,
    goal: Dict[str,str]|None,
    analyzed: Dict[str,Any]|None
) -> str:
    """
    환자 흐름용: 제출값 + OpenAI 대화분석(키워드/무드/추정 목표 등)을
    사람이 읽을 수 있는 짧은 bullet 텍스트로 정리.
    """
    v = vas or {}
    p = prefs or {}
    g = goal or {}
    a = analyzed or {}

    # 💡 2. (수정) 이전 코드의 'p.get("genres")'는 잘못된 키였습니다.
    # 프론트엔드에서 보내주는 'preferred'와 'disliked' 키를 사용하여 장르 정보를 올바르게 가져옵니다.
    preferred_genres = ", ".join(p.get("preferred", []) or [])
    disliked_genres = ", ".join(p.get("disliked", []) or [])
    
    # 💡 3. (수정) 이전 코드의 'p.get("lyrics_allowed")'는 잘못된 키였습니다.
    # 'vocals_allowed' 키를 사용하고, AI가 이해하기 쉬운 문장으로 변환합니다.
    vocals_instruction = "가사가 있는 보컬을 포함해야 합니다." if p.get("vocals_allowed", False) else "보컬 없이 연주곡(Instrumental)으로만 구성해야 합니다."

    # 💡 4. (수정) 이전 코드의 'v.get("depression")'은 잘못된 키였습니다.
    # 'mood' 키를 사용하여 기분 점수를 올바르게 가져옵니다.
    anxiety_level = v.get('anxiety', 'N/A')
    mood_level = v.get('mood', 'N/A')
    pain_level = v.get('pain', 'N/A')
    
    # 💡 5. (수정) 이전 코드는 딕셔너리 전체(g)를 출력했습니다.
    # 'g.get('text')'를 사용해 목표 텍스트만 정확히 추출합니다.
    goal_text = g.get('text') or a.get('target') or "상담 목표 없음"
    
    analyzed_mood = a.get("mood", "알 수 없음")
    analyzed_keywords = ", ".join(a.get("keywords", []) or [])

    # 💡 6. (수정) 이전 코드는 단순 나열('- VAS: ...') 방식이라 AI가 오해하기 쉬웠습니다.
    # AI가 헷갈리지 않도록 완전한 문장 형식의 지시문으로 변경했습니다.
    lines = [
        f"환자의 현재 상태는 다음과 같습니다: 불안 점수 {anxiety_level}/10, 기분 점수 {mood_level}/10 (높을수록 부정적), 통증 점수 {pain_level}/10.",
        f"환자의 궁극적인 상담 목표는 '{goal_text}'입니다.",
        f"AI 채팅 분석 결과, 음악의 핵심 분위기(mood)는 '{analyzed_mood}'이어야 하며, '{analyzed_keywords or '없음'}' 키워드를 반영해야 합니다.",
        f"환자가 선호하는 음악 장르는 '{preferred_genres or '특별히 없음'}'이며, 이는 중요한 참고사항입니다.",
        f"환자가 싫어하는 장르는 '{disliked_genres or '없음'}'이므로, 이 장르들은 반드시 피해야 합니다.",
        f"음악에는 {vocals_instruction}",
        "마지막으로, 급격한 볼륨 변화나 놀라게 하는 요소 없이 안정적인 흐름을 유지해야 합니다.",
    ]
    return "\n".join(lines)

def build_extra_requirements_for_therapist(
    manual: Dict[str,Any]
) -> str:
    inc = ", ".join(manual.get("include_instruments", []) or [])
    exc = ", ".join(manual.get("exclude_instruments", []) or [])
    bpm_line = ""
    if manual.get("bpm_min") is not None and manual.get("bpm_max") is not None:
        bpm_line = f"{manual['bpm_min']}~{manual['bpm_max']} BPM"

    lines = [
        f"- 장르: {manual.get('genre','')}",
        f"- 분위기: {manual.get('mood','')}",
        f"- 템포: {bpm_line or ''}",
        f"- 키: {manual.get('key_signature','')}",
        f"- 보컬: {'허용' if manual.get('vocals_allowed') else '금지(연주곡)'}",
        f"- 포함 악기: {inc or 'n/a'}",
        f"- 배제 악기: {exc or 'n/a'}",
        f"- 길이: {manual.get('duration_sec', 120)}초",
        f"- 추가 노트: {manual.get('notes','')}",
        f"- 안전: 급격한 다이내믹/서프라이즈 금지, 과도한 음압 금지",
    ]
    return "\n".join([s for s in lines if s and s.strip()])

