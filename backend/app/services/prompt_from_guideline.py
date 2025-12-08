from __future__ import annotations
from typing import Dict, Any
from app.services.openai_chat import chat_complete
async def generate_first_counseling_message(
    user_name: str,
    goal_text: str | None,
    vas_data: dict | None
) -> str:
    """
    환자의 이름, 목표, VAS 점수를 바탕으로 AI가 자연스러운 첫 인사를 생성합니다.
    """
    
    # 1. VAS 점수 분석 (가장 높은 점수 찾기)
    highest_vas = None
    if vas_data:
        # 점수가 높은 순으로 정렬
        sorted_vas = sorted(
            [("불안", vas_data.get('anxiety', 0)), 
             ("우울", vas_data.get('depression', 0)), 
             ("통증", vas_data.get('pain', 0))],
            key=lambda x: x[1], reverse=True
        )
        # 가장 높은 점수가 5점 이상일 때만 언급
        if sorted_vas[0][1] >= 6:
            highest_vas = sorted_vas[0]

    # 2. 프롬프트 구성
    system_prompt = (
        "당신은 따뜻하고 공감 능력이 뛰어난 전문 심리 상담사입니다. "
        "환자의 이름과 사전 접수 내용(목표, 상태)을 바탕으로 첫 상담을 시작하는 오프닝 멘트를 작성하세요.\n"
        "규칙:\n"
        "- 환자의 이름을 부르며 정중하게 시작하세요.\n"
        "- 환자가 작성한 '상담 목표'를 언급하며, 이를 돕겠다는 의지를 보여주세요.\n"
        "- 만약 환자의 상태(VAS 점수 10점 만점, 5점은 보통)가 좋지 않다면, 그 감정을 알아차려주고 공감해주세요.\n"
        "- 마지막은 환자가 편안하게 이야기를 시작할 수 있도록 열린 질문으로 끝내세요.\n"
        "- 3~4문장 내외로 부드러운 말투(해요체)를 사용하세요."
    )

    user_context = f"환자 이름: {user_name}\n"
    
    if goal_text:
        user_context += f"상담 목표: {goal_text}\n"
    else:
        user_context += "상담 목표: (작성하지 않음)\n"

    if highest_vas:
        user_context += f"현재 상태: '{highest_vas[0]}' 수치가 {highest_vas[1]}점(10점 만점)으로 높습니다.\n"
    
    # 3. AI에게 생성 요청
    # openai_chat.py의 chat_complete 함수 사용
    messages = [{"role": "user", "content": user_context}]
    
    try:
        # system_prompt를 인자로 넘겨서 호출
        response_text = await chat_complete(messages, system_prompt=system_prompt)
        return response_text
    except Exception as e:
        print(f"First message generation failed: {e}")
        return f"안녕하세요, {user_name}님. 오늘 상담을 통해 마음이 한결 편안해지시길 바랍니다. 어떤 이야기를 나누고 싶으신가요?"
def build_extra_requirements_for_patient(
    vas: Dict[str,int]|None,
    prefs: Dict[str,Any]|None,
    goal: Dict[str,str]|None,
    analyzed: Dict[str,Any]|None,
) -> str:
    """
    VAS(불안/우울/통증), 음악 선호/금기, 상담 대화 분석 결과(analyzed)를 종합해
    '환자 원본 데이터' 텍스트를 만든다.
    여기에는 다음이 포함된다:
      - HARD CONSTRAINTS (절대 위반 금지: 금지 장르, no piano, 가사 금지 등)
      - 환자의 현재 상태(VAS)
      - 상담 목표
      - 대화에서 추출된 mood/keywords/storyline/imagery/quote_like_phrase
      - 선호 장르, 선호 분위기, 템포 힌트 등
    """
    v = vas or {}
    p = prefs or {}
    g = goal or {}
    a = analyzed or {}

   # 💡 [핵심 수정] intake/patient/page.tsx의 handleSubmit이 보낸 키(Key)와 일치시킴
    preferred_genres = ", ".join(p.get("genres", []) or [])
    disliked_genres = ", ".join(p.get("contraindications", []) or [])
    lyrics_allowed = bool(p.get("lyrics_allowed", False))

    anxiety_level = v.get('anxiety', 'N/A')
    mood_level = v.get('depression', 'N/A') # 👈 'depression' 키 사용 (payload.vas.depression)
    pain_level = v.get('pain', 'N/A')
    
    # 💡 4. [수정] goal 키 이름 일치
    goal_text = g.get('text') or a.get('target') or "상담 목표 없음"
    
    analyzed_mood = a.get("mood", "calming")
    analyzed_keywords = ", ".join(a.get("keywords", []) or [])
    analyzed_constraints = a.get("music_constraints") # (예: "no piano", "fast tempo")
    if isinstance(analyzed_constraints, list):
        analyzed_constraints = ", ".join(analyzed_constraints)

    storyline = a.get("storyline") or ""
    imagery_list = a.get("imagery") or []
    quote_like = a.get("quote_like_phrase") or ""

    tempo_hint = "BPM은 70-80 사이의 느린 템포가 적합합니다."
    try:
        mood_val = int(mood_level)
        if mood_val <= 3:
            tempo_hint = "BPM은 80-95 사이의 적당한 템포가 적합합니다."
        elif mood_val >= 8:
            tempo_hint = "BPM은 60-70 사이의 매우 느린 템포가 적합합니다."
        elif mood_val >= 7:
            tempo_hint = "BPM은 90-110 사이의 중간 템포가 적합합니다."
    except (ValueError, TypeError):
        # 숫자로 변환 실패 시 기본 템포 유지
        pass
    
    # 2. (최우선) 만약 AI 분석가가 '채팅'에서 템포 관련 언급을 찾았다면, VAS 힌트를 덮어쓴다.
    if analyzed_constraints:
        ac_lower = str(analyzed_constraints).lower()
        if "fast tempo" in ac_lower and "slow tempo" not in ac_lower:
            tempo_hint = "BPM은 110-130 사이의 빠르고 활기찬 템포가 적합합니다."
        elif "slow tempo" in ac_lower and "fast tempo" not in ac_lower:
            tempo_hint = "BPM은 60-70 사이의 매우 느린 템포가 적합합니다."

    hard_lines: list[str] = []
    
    if disliked_genres:
        hard_lines.append(f"금지 장르: {disliked_genres}")

    # 가사 금지
    if not lyrics_allowed:
        hard_lines.append("가사는 사용하지 말 것 (Instrumental only).")

    # 분석 기반 제약
    if analyzed_constraints:
        hard_lines.append(f"대화 기반 음악 제약: {analyzed_constraints}")

        # 예시: no piano 같은 금기 요소를 명시적으로 강조
        ac_lower = str(analyzed_constraints).lower()
        if "no piano" in ac_lower:
            hard_lines.append("피아노는 절대 사용하지 말 것 (no piano).")

    state_story_lines: list[str] = []

    state_story_lines.append(
        f"환자의 현재 상태는 불안 VAS {anxiety_level}/10, "
        f"우울 VAS {mood_level}/10, 통증 VAS {pain_level}/10 입니다."
    )

    state_story_lines.append(f"환자의 궁극적인 상담 목표는 '{goal_text}' 입니다.")

    state_story_lines.append(
        f"AI 채팅 분석 결과, 음악의 핵심 분위기(mood)는 '{analyzed_mood}' 이며 "
        f"핵심 키워드는 [{analyzed_keywords}] 입니다."
    )

    if storyline:
        state_story_lines.append(f"음악이 표현해야 할 스토리: {storyline}")

    if imagery_list:
        state_story_lines.append(
            "대화에서 추출한 핵심 이미지와 상징: "
            + ", ".join(imagery_list)
        )

    if quote_like:
        state_story_lines.append(
            f"환자의 말 중 음악이 특히 담아야 할 메시지: \"{quote_like}\""
        )

    if preferred_genres:
        state_story_lines.append(
            f"환자가 선호하는 음악 장르는 {preferred_genres} 입니다."
        )

    vocals_instruction = (
        "가사가 있는 보컬을 포함해도 됩니다."
        if lyrics_allowed
        else "보컬 없이 연주곡(Instrumental)으로만 구성해야 합니다."
    )

    state_story_lines.append(
        f"보컬 및 가사 사용에 대한 기본 지침: {vocals_instruction}"
    )

    state_story_lines.append(f"템포에 대한 기본 권장 사항: {tempo_hint}")

    # --- 최종 문자열 합치기 ---
    lines: list[str] = []

    if hard_lines:
        lines.append("=== HARD CONSTRAINTS (절대 위반 금지) ===")
        lines.extend(hard_lines)
        lines.append("")  # 빈 줄

    lines.append("=== PATIENT STATE & STORY ===")
    lines.extend(state_story_lines)

    # 빈 줄/빈 문자열 제거 후 합치기
    return "\n".join(s for s in lines if s and str(s).strip())

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

