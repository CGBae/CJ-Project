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

   # 💡 [핵심 수정] intake/patient/page.tsx의 handleSubmit이 보낸 키(Key)와 일치시킴
    preferred_genres = ", ".join(p.get("genres", []) or [])
    disliked_genres = ", ".join(p.get("contraindications", []) or [])
    
    vocals_instruction = "가사가 있는 보컬을 포함해야 합니다." if p.get("lyrics_allowed", False) else "보컬 없이 연주곡(Instrumental)으로만 구성해야 합니다."

    anxiety_level = v.get('anxiety', 'N/A')
    mood_level = v.get('depression', 'N/A') # 👈 'depression' 키 사용 (payload.vas.depression)
    pain_level = v.get('pain', 'N/A')
    
    # 💡 4. [수정] goal 키 이름 일치
    goal_text = g.get('text') or a.get('target') or "상담 목표 없음"
    
    analyzed_mood = a.get("mood", "calming")
    analyzed_keywords = ", ".join(a.get("keywords", []) or [])
    analyzed_constraints = a.get("music_constraints") # (예: "no piano", "fast tempo")


    tempo_hint = "BPM은 70-80 사이의 느린 템포" 
    try:
        mood_val = int(mood_level)
        anxiety_val = int(anxiety_level)
        if anxiety_val >= 7:
            tempo_hint = "BPM은 60-70 사이의 매우 느린 템포 (불안 완화 우선)"
        elif mood_val >= 7:
            tempo_hint = "BPM은 90-110 사이의 중간 템포 (기분 전환)"
    except (ValueError, TypeError):
        pass 
    
    # 2. (최우선) 만약 AI 분석가가 '채팅'에서 템포 관련 언급을 찾았다면, VAS 힌트를 덮어쓴다.
    if analyzed_constraints:
        if "fast tempo" in analyzed_constraints or "slow tempo dislike" in analyzed_constraints:
             # (예: "조용한 노래 싫고 상큼한 노래 원해요" -> "fast tempo")
            tempo_hint = "BPM은 110-130 사이의 빠르고 활기찬 템포 (환자가 채팅에서 '빠른/상큼한' 템포를 명시적으로 요구함)"
        elif "slow tempo" in analyzed_constraints or "fast tempo dislike" in analyzed_constraints:
            tempo_hint = "BPM은 60-70 사이의 매우 느린 템포 (환자가 채팅에서 '느린' 템포를 명시적으로 요구함)"

    # 💡 6. (수정) 이전 코드는 단순 나열('- VAS: ...') 방식이라 AI가 오해하기 쉬웠습니다.
    # AI가 헷갈리지 않도록 완전한 문장 형식의 지시문으로 변경했습니다.
    lines = [
        f"환자의 현재 상태는 다음과 같습니다: 불안 점수 {anxiety_level}/10, 기분(우울) 점수 {mood_level}/10 (높을수록 부정적), 통증 점수 {pain_level}/10.",
        f"환자의 궁극적인 상담 목표는 '{goal_text}'입니다.",
        f"AI 채팅 분석 결과, 음악의 핵심 분위기(mood)는 '{analyzed_mood}'이어야 하며, '{analyzed_keywords or '없음'}' 키워드를 반영해야 합니다.",
        f"AI 채팅 분석 결과, 환자가 명시적으로 요구하거나 거부한 음악 요소(constraints)는 '{analyzed_constraints}'입니다. 이 요소(예: 'no piano')는 프롬프트에 '반드시' 반영되어야 합니다."
        f"환자가 선호하는 음악 장르는 '{preferred_genres or '특별히 없음'}'이며, 이는 중요한 참고사항입니다.",
        f"환자가 싫어하는 장르는 '{disliked_genres or '없음'}'이므로, 이 장르들은 반드시 피해야 합니다.",
        f"음악에는 {vocals_instruction}.",
        f"환자 상태(VAS)에 기반한 추천 템포(BPM)는 '{tempo_hint}'입니다. (BPM 지시가 없다면 이것을 사용)",
        "마지막으로, 급격한 볼륨 변화나 놀라게 하는 요소 없이 안정적인 흐름을 유지해야 합니다.",
    ]
    return "\n".join(lines)

def build_extra_requirements_for_therapist(
    manual: Dict[str,Any]
) -> str:
    # 💡 6. [수정] 상담사 상세 옵션 추가 (intake/counselor 페이지와 일치)
    # (이전 답변에서 이 부분이 누락되었을 수 있습니다. manual.get('genre') 등 확인)
    
    # (intake/counselor의 manualPayload와 키가 일치해야 함)
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
        f"- 불협화음: {manual.get('harmonic_dissonance', 'Neutral')}",
        f"- 리듬 복잡도: {manual.get('rhythm_complexity', 'Neutral')}",
        f"- 선율 윤곽: {manual.get('melody_contour', 'Neutral')}",
        f"- 음악적 밀도: {manual.get('texture_density', 'Neutral')}",
        f"- 안전: 급격한 다이내믹/서프라이즈 금지, 과도한 음압 금지",
    ]
    return "\n".join([s for s in lines if s and s.strip()])

