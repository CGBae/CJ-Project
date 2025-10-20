from __future__ import annotations

COMPOSE_KEYWORDS = [
    "음악 생성", "음악 만들어", "노래 만들어", "트랙 생성",
    "compose", "generate music", "create track"
]

def is_compose_request(text: str) -> bool:
    s = (text or "").lower()
    return any(k in s for k in COMPOSE_KEYWORDS)
