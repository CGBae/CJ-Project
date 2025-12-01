from __future__ import annotations
from typing import Dict, Any, List
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

