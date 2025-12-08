# app/workers/music_worker.py
import os, json, asyncio, httpx, time  # type: ignore
from aiokafka import AIOKafkaConsumer  # type: ignore
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.db import async_session_maker
from app.models import Track

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "redpanda:9092")
TOPIC_REQ = os.getenv("KAFKA_TOPIC_REQUESTS", "music.gen.requests")
GROUP_ID = os.getenv("KAFKA_GROUP_MUSIC_WORKERS", "music-workers")

ELEVEN_BASE = os.getenv("ELEVEN_MUSIC_BASE", "https://api.elevenlabs.io")
ELEVEN_CREATE = os.getenv("ELEVEN_MUSIC_CREATE", "/v1/music/generate")  # /v1/music/compose 계열
ELEVEN_API_KEY = os.getenv("ELEVEN_API_KEY", "")


def _sanitize_for_db(s: str, limit: int = 500) -> str:
    """Postgres TEXT에 안전하게 넣을 수 있도록 NUL 제거 + 길이 제한."""
    return s.replace("\x00", "")[:limit]


async def handle_message(payload: dict):
    """Kafka에서 들어온 한 건의 음악 생성 요청을 처리 (동기 MP3 응답 방식)."""

    task_id = payload.get("task_id")
    if task_id is None:
        print("[music_worker] payload에 task_id가 없습니다:", payload)
        return

    print(f"[music_worker] 🎵 handle_message 시작 - task_id={task_id}, payload={payload}")

    music_length_ms = int(payload.get("music_length_ms") or 60000)  # 기본 60초
    duration_sec = max(music_length_ms // 1000, 5)
    force_instrumental = bool(payload.get("force_instrumental", False))
    extra = payload.get("extra") or {}

    async with async_session_maker() as db:  # type: AsyncSession
        try:
            # 1) Track 조회
            result = await db.execute(select(Track).where(Track.id == task_id))
            track = result.scalar_one_or_none()
            if not track:
                print(f"[music_worker] ⚠️ Track(id={task_id})을 찾을 수 없습니다. payload={payload}")
                return

            if track.status in ("READY", "COMPLETED", "FAILED"):
                print(f"[music_worker] ⏭ 이미 처리된 트랙 (status={track.status}), id={task_id}")
                return

            # PROCESSING로 전이
            await db.execute(
                update(Track)
                .where(Track.id == task_id)
                .values(status="PROCESSING")
            )
            await db.commit()

            # 프롬프트 결정
            prompt_text = payload.get("prompt") or (track.prompt or "")
            if not prompt_text:
                err = "empty prompt"
                print(f"[music_worker] ❌ 프롬프트가 비어있습니다. id={task_id}")
                await db.execute(
                    update(Track)
                    .where(Track.id == task_id)
                    .values(status="FAILED", error=err)
                )
                await db.commit()
                return

            if not ELEVEN_API_KEY:
                err = "ELEVEN_API_KEY is not set in environment"
                print(f"[music_worker] ❌ {err}")
                await db.execute(
                    update(Track)
                    .where(Track.id == task_id)
                    .values(status="FAILED", error=err)
                )
                await db.commit()
                return

            headers = {
                "xi-api-key": ELEVEN_API_KEY,
                "Content-Type": "application/json",
            }

            # 2) ElevenLabs에 직접 음악 생성 요청 (응답 = MP3 바이너리)
            body = {
                # 공식 문서 기준: prompt + music_length_ms
                "prompt": prompt_text,
                "music_length_ms": music_length_ms,
            }
            # 보수적으로 instrumental 옵션 힌트
            if force_instrumental:
                body["instrumental"] = True  # 실제 API에서 허용하는 필드면 사용됨

            if isinstance(extra, dict):
                # extra에 추가 파라미터가 있다면 body에 병합
                body.update(extra)

            print(
                f"[music_worker] ▶️ ElevenLabs 생성 요청: {ELEVEN_CREATE}, "
                f"duration={duration_sec}s, body keys={list(body.keys())}"
            )

            async with httpx.AsyncClient(base_url=ELEVEN_BASE, timeout=300) as client:
                resp = await client.post(ELEVEN_CREATE, json=body, headers=headers)
                # HTTP 에러면 여기서 먼저 처리
                try:
                    resp.raise_for_status()
                except httpx.HTTPStatusError as he:
                    # 응답 바디는 바이너리일 수도 있으니 조심해서 preview만
                    raw = resp.content[:300]
                    preview = _sanitize_for_db(raw.decode("utf-8", errors="ignore"))
                    err_msg = _sanitize_for_db(
                        f"create_http_error {he.response.status_code}: {preview}"
                    )
                    print(f"[music_worker] ❌ ElevenLabs HTTP 에러: {err_msg}")
                    await db.execute(
                        update(Track)
                        .where(Track.id == task_id)
                        .values(status="FAILED", error=err_msg)
                    )
                    await db.commit()
                    return

                audio_bytes = resp.content
                if not audio_bytes or len(audio_bytes) < 1000:
                    err_msg = _sanitize_for_db(
                        f"empty_or_too_small_audio len={len(audio_bytes)}"
                    )
                    print(f"[music_worker] ❌ 오디오 데이터가 비정상: {err_msg}")
                    await db.execute(
                        update(Track)
                        .where(Track.id == task_id)
                        .values(status="FAILED", error=err_msg)
                    )
                    await db.commit()
                    return

            # 3) 파일로 저장
            save_dir = "static/audio"
            os.makedirs(save_dir, exist_ok=True)

            file_name = f"music_{int(time.time())}_{task_id}.mp3"
            file_path = os.path.join(save_dir, file_name)

            with open(file_path, "wb") as f:
                f.write(audio_bytes)

            public_url = f"/{save_dir.replace(os.sep, '/')}/{file_name}"
            print(f"[music_worker] 🎉 음악 파일 저장 완료: {file_path} (url={public_url})")

            # 4) Track 업데이트 (READY + track_url)
            await db.execute(
                update(Track)
                .where(Track.id == task_id)
                .values(status="READY", track_url=public_url)
            )
            await db.commit()
            print(f"[music_worker] ✅ Track(id={task_id}) 상태 READY, url 저장 완료")

        except Exception as e:
            # 트랜잭션이 이미 깨졌을 수 있으므로 롤백 후 에러 기록 시도
            await db.rollback()
            err_msg = _sanitize_for_db(f"exception: {e}")
            print(f"[music_worker] 💥 예외 발생: {err_msg}")
            try:
                await db.execute(
                    update(Track)
                    .where(Track.id == task_id)
                    .values(status="FAILED", error=err_msg)
                )
                await db.commit()
            except Exception as e2:
                # 여기서 또 실패해도 그냥 로그만 남기고 끝냄
                print(f"[music_worker] !!! 에러 저장 중 추가 예외: {e2}")


async def main():
    print(
        f"[music_worker] 🚀 시작 - bootstrap={KAFKA_BOOTSTRAP}, "
        f"topic={TOPIC_REQ}, group_id={GROUP_ID}"
    )
    consumer = AIOKafkaConsumer(
        TOPIC_REQ,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id=GROUP_ID,
        value_deserializer=lambda v: json.loads(v),
        key_deserializer=lambda v: v.decode() if v is not None else None,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
    )
    await consumer.start()
    try:
        while True:
            batch = await consumer.getmany(timeout_ms=1000)
            for tp, messages in batch.items():
                for msg in messages:
                    print(
                        f"[music_worker] 📩 새 메시지 수신 - offset={msg.offset}, "
                        f"key={msg.key}, value={msg.value}"
                    )
                    await handle_message(msg.value)
                    await consumer.commit()
    finally:
        await consumer.stop()


if __name__ == "__main__":
    asyncio.run(main())
