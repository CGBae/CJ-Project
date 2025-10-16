from openai import OpenAI
client = OpenAI()

SYSTEM = (
  "당신은 ElevenLabs Music API를 위한 전문 프롬프트 엔지니어입니다. " 
  "입력되는 가이드라인과 요구사항을 모두 반영해, 모델이 해석 가능한 "
  "구체적 음악 용어만 사용하여 '단 하나의 텍스트 프롬프트'를 생성하세요. "
  "출력은 프롬프트 본문만, 다른 말 금지."
)

def build_request(user_guideline_json: str, extra_requirements: str):
    user_msg = f"""
다음 JSON 가이드라인과 추가 요구사항을 바탕으로, ElevenLabs Music용 단일 텍스트 프롬프트를 생성해 주세요.
JSON 가이드라인:
{user_guideline_json}

추가 요구사항:
{extra_requirements}
"""
    return [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user_msg}
    ]

resp = client.responses.create(
    model="gpt-4.1-mini",  # 또는 gpt-4.1-mini 등
    input=build_request(GUIDELINE_JSON, EXTRA_REQ),
)
final_prompt_text = resp.output_text  # 모델이 생성한 '단 하나의 프롬프트'
print(final_prompt_text)
