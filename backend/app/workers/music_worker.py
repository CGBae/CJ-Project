# app/workers/music_worker.py
import os, json, asyncio, httpx, time # type: ignore
from aiokafka import AIOKafkaConsumer # type: ignore
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.db import async_session_maker
from app.models import Track

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "redpanda:9092")
TOPIC_REQ = os.getenv("KAFKA_TOPIC_REQUESTS", "music.gen.requests")
GROUP_ID = os.getenv("KAFKA_GROUP_MUSIC_WORKERS", "music-workers")

ELEVEN_BASE = os.getenv("ELEVEN_MUSIC_BASE")
ELEVEN_CREATE = os.getenv("ELEVEN_MUSIC_CREATE", "/v1/music/generate")
ELEVEN_STATUS = os.getenv("ELEVEN_MUSIC_STATUS", "/v1/music/tasks/{task_id}")
ELEVEN_DOWNLOAD_FIELD = os.getenv("ELEVEN_MUSIC_DOWNLOAD_FIELD", "audio_url")
ELEVEN_API_KEY = os.getenv("ELEVEN_API_KEY")

async def handle_message(payload: dict):
    task_id = payload["task_id"]
    async with async_session_maker() as db:  # type: AsyncSession
        # 멱등성: 이미 완료면 스킵
        result = await db.execute(select(Track).where(Track.id == task_id))
        track = result.scalar_one_or_none()
        if not track:
            # 로그만 남기고 메시지 스킵
            return
        if track.status in ("COMPLETED", "FAILED"):
            return

        # PROCESSING로 전이
        await db.execute(update(Track).where(Track.id == task_id).values(status="PROCESSING"))
        await db.commit()

        headers = {"xi-api-key": ELEVEN_API_KEY}  # 예시
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                # 1) 생성 요청
                create = await client.post(f"{ELEVEN_BASE}{ELEVEN_CREATE}", json={"text": track.prompt}, headers=headers)
                create.raise_for_status()
                ext_task_id = create.json().get("task_id")  # 실제 응답 필드명에 맞게 수정
                await db.execute(update(Track).where(Track.id == task_id).values(task_external_id=ext_task_id))
                await db.commit()

                # 2) 폴링
                backoff = 1
                for _ in range(30):  # 최대 N회 폴링
                    st = await client.get(f"{ELEVEN_BASE}{ELEVEN_STATUS}".format(task_id=ext_task_id), headers=headers)
                    st.raise_for_status()
                    data = st.json()
                    if data.get("status") == "completed":
                        audio_url = data.get(ELEVEN_DOWNLOAD_FIELD)
                        await db.execute(update(Track).where(Track.id == task_id).values(status="READY", track_url=audio_url))
                        await db.commit()
                        return
                    if data.get("status") == "failed":
                        err = data.get("error", "provider failed")
                        await db.execute(update(Track).where(Track.id == task_id).values(status="FAILED", error=err))
                        await db.commit()
                        return
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 1.5, 10)
                # 타임아웃
                await db.execute(update(Track).where(Track.id == task_id).values(status="FAILED", error="timeout"))
                await db.commit()

        except Exception as e:
            await db.execute(update(Track).where(Track.id == task_id).values(status="FAILED", error=str(e)))
            await db.commit()
            # 필요 시 DLQ로 재전송 가능

async def main():
    consumer = AIOKafkaConsumer(
        TOPIC_REQ,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id=GROUP_ID,
        value_deserializer=lambda v: json.loads(v),
        key_deserializer=lambda v: v.decode(),
        enable_auto_commit=False,
        auto_offset_reset="earliest",
    )
    await consumer.start()
    try:
        while True:
            batch = await consumer.getmany(timeout_ms=1000)
            for tp, messages in batch.items():
                for msg in messages:
                    await handle_message(msg.value)
                    await consumer.commit()
    finally:
        await consumer.stop()

if __name__ == "__main__":
    asyncio.run(main())
