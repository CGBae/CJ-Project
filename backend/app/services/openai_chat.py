from __future__ import annotations
import os, asyncio
from typing import List, Dict
from openai import OpenAI
from app.config import THERAPEUTIC_SYSTEM_PROMPT

MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
_client = OpenAI()

def _messages_for_openai(system_prompt: str, history: List[Dict[str,str]]):
    # history = [{"role":"user","content":"..."}, {"role":"assistant","content":"..."}...]
    messages = [{"role":"system", "content": system_prompt}]
    # 너무 길면 최근 N개만 유지 (토큰 보호)
    MAX_TURNS = 12  # user/assistant 페어 기준
    truncated = history[-(MAX_TURNS*2):]
    messages.extend(truncated)
    return messages

async def chat_complete(history: List[Dict[str,str]], *, system_prompt: str = THERAPEUTIC_SYSTEM_PROMPT) -> str:
    def _call():
        return _client.responses.create(
            model=MODEL,
            input=_messages_for_openai(system_prompt, history)
        )
    resp = await asyncio.to_thread(_call)
    return resp.output_text.strip()
