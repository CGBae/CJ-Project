from __future__ import annotations
from typing import Dict, Any, List

def build_extra_requirements_for_patient(
    vas: Dict[str,int]|None,
    prefs: Dict[str,Any]|None,
    goal: Dict[str,int]|None,
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

    genres = ", ".join(p.get("genres", []) or [])
    contra = ", ".join(p.get("contraindications", p.get("contra", [])) or [])

    bpm_line = ""
    if p.get("bpm_min") is not None and p.get("bpm_max") is not None:
        bpm_line = f"{p['bpm_min']}~{p['bpm_max']} BPM"
    mood = a.get("mood") or "calming"
    keywords = ", ".join(a.get("keywords", []) or [])

    lines = [
        f"- VAS: anxiety={v.get('anxiety')}, depression={v.get('depression')}, pain={v.get('pain')}",
        f"- 장르 우선순위: {genres or 'ambient'}",
        f"- 금기: {contra or '없음'}",
        f"- 템포: {bpm_line or '필요 시 70~80 BPM 권장'}",
        f"- 보컬: {'허용' if p.get('lyrics_allowed') else '금지(연주곡)'}",
        f"- 목표: {g or a.get('target') or {'anxiety': 4}}",
        f"- 분석 무드/키워드(참고): {mood}; {keywords or 'n/a'}",
        f"- 안전: 급격한 다이내믹/서프라이즈 금지, 과도한 음압 금지",
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
