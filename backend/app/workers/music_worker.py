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
ELEVEN_CREATE = os.getenv("ELEVEN_MUSIC_CREATE", "/v1/music/generate")
ELEVEN_STATUS = os.getenv("ELEVEN_MUSIC_STATUS", "/v1/music/tasks/{task_id}")
ELEVEN_DOWNLOAD_FIELD = os.getenv("ELEVEN_MUSIC_DOWNLOAD_FIELD", "audio_url")
ELEVEN_API_KEY = os.getenv("ELEVEN_API_KEY", "")


async def handle_message(payload: dict):
    """Kafka에서 들어온 한 건의 음악 생성 요청을 처리"""

    task_id = payload.get("task_id")
    if task_id is None:
        print("[music_worker] payload에 task_id가 없습니다:", payload)
        return

    print(f"[music_worker] 🎵 handle_message 시작 - task_id={task_id}, payload={payload}")

    # Kafka payload에서 길이/옵션 추출
    music_length_ms = int(payload.get("music_length_ms") or 60000)  # 기본 60초
    duration_sec = max(music_length_ms // 1000, 5)                  # 최소 5초
    force_instrumental = bool(payload.get("force_instrumental", False))
    extra = payload.get("extra") or {}

    async with async_session_maker() as db:  # type: AsyncSession
        # 1) Track 조회
        result = await db.execute(select(Track).where(Track.id == task_id))
        track = result.scalar_one_or_none()
        if not track:
            print(f"[music_worker] ⚠️ Track(id={task_id})을 찾을 수 없습니다. payload={payload}")
            return

        # 이미 완료/실패인 경우 스킵
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

        # 프롬프트: payload 기준으로, 없으면 DB prompt 사용
        prompt_text = payload.get("prompt") or track.prompt or ""
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

        try:
            async with httpx.AsyncClient(base_url=ELEVEN_BASE, timeout=60) as client:
                # 2) ElevenLabs 음악 생성 요청
                #    - text / prompt / musicLengthMs 를 모두 넣어서 호환성 확보
                body = {
                    "text": prompt_text,          # 일부 예전 샘플에서 쓰는 필드
                    "prompt": prompt_text,        # Eleven Music JS 클라이언트 스타일
                    "musicLengthMs": music_length_ms,
                }
                # force_instrumental, extra 등 추가 옵션 병합
                if force_instrumental:
                    # API에 따라 다를 수 있으니, 기본적으로 힌트만 추가
                    body["vocals"] = "off"
                if isinstance(extra, dict):
                    # extra에 API body에 넘겨야 할 옵션이 있다면 그대로 합침
                    body.update(extra)

                print(
                    f"[music_worker] ▶️ ElevenLabs 생성 요청: {ELEVEN_CREATE}, "
                    f"duration={duration_sec}s, body keys={list(body.keys())}"
                )

                create_resp = await client.post(ELEVEN_CREATE, json=body, headers=headers)
                try:
                    create_resp.raise_for_status()
                except httpx.HTTPStatusError as he:
                    # HTTP 에러 응답 본문까지 DB에 저장
                    err_body = create_resp.text
                    err_msg = f"create_http_error {he.response.status_code}: {err_body}"
                    print(f"[music_worker] ❌ ElevenLabs 생성 요청 실패: {err_msg}")
                    await db.execute(
                        update(Track)
                        .where(Track.id == task_id)
                        .values(status="FAILED", error=err_msg)
                    )
                    await db.commit()
                    return

                try:
                    create_json = create_resp.json()
                except Exception as je:
                    err_msg = f"create_json_parse_error: {je}, body={create_resp.text[:500]}"
                    print(f"[music_worker] ❌ 생성 응답 JSON 파싱 실패: {err_msg}")
                    await db.execute(
                        update(Track)
                        .where(Track.id == task_id)
                        .values(status="FAILED", error=err_msg)
                    )
                    await db.commit()
                    return

                ext_task_id = create_json.get("task_id") or create_json.get("id")
                if not ext_task_id:
                    err_msg = f"no task_id in create response: {create_json}"
                    print(f"[music_worker] ❌ {err_msg}")
                    await db.execute(
                        update(Track)
                        .where(Track.id == task_id)
                        .values(status="FAILED", error=err_msg)
                    )
                    await db.commit()
                    return

                print(f"[music_worker] ✅ ElevenLabs 생성 요청 성공 - ext_task_id={ext_task_id}")

                await db.execute(
                    update(Track)
                    .where(Track.id == task_id)
                    .values(task_external_id=ext_task_id)
                )
                await db.commit()

                # 3) 상태 폴링
                backoff = 1.0
                max_polls = 30
                status_url = ELEVEN_STATUS.format(task_id=ext_task_id)

                for i in range(max_polls):
                    print(f"[music_worker] ⏳ 상태 폴링 {i+1}/{max_polls} - {status_url}")
                    st_resp = await client.get(status_url, headers=headers)
                    try:
                        st_resp.raise_for_status()
                    except httpx.HTTPStatusError as he:
                        err_body = st_resp.text
                        err_msg = f"status_http_error {he.response.status_code}: {err_body}"
                        print(f"[music_worker] ❌ 상태 폴링 HTTP 에러: {err_msg}")
                        await db.execute(
                            update(Track)
                            .where(Track.id == task_id)
                            .values(status="FAILED", error=err_msg)
                        )
                        await db.commit()
                        return

                    try:
                        data = st_resp.json()
                    except Exception as je:
                        err_msg = f"status_json_parse_error: {je}, body={st_resp.text[:500]}"
                        print(f"[music_worker] ❌ 상태 응답 JSON 파싱 실패: {err_msg}")
                        await db.execute(
                            update(Track)
                            .where(Track.id == task_id)
                            .values(status="FAILED", error=err_msg)
                        )
                        await db.commit()
                        return

                    st = data.get("status")
                    print(f"[music_worker] 📡 현재 상태: {st}, data keys={list(data.keys())}")

                    if st == "completed":
                        audio_url = data.get(ELEVEN_DOWNLOAD_FIELD) or data.get("audioUrl") or data.get("url")
                        if not audio_url:
                            err_msg = f"completed but no audio url in field '{ELEVEN_DOWNLOAD_FIELD}': {data}"
                            print(f"[music_worker] ❌ {err_msg}")
                            await db.execute(
                                update(Track)
                                .where(Track.id == task_id)
                                .values(status="FAILED", error=err_msg)
                            )
                            await db.commit()
                            return

                        print(f"[music_worker] 🎉 완료 - audio_url={audio_url}")
                        await db.execute(
                            update(Track)
                            .where(Track.id == task_id)
                            .values(status="READY", track_url=audio_url)
                        )
                        await db.commit()
                        return

                    if st == "failed":
                        err = data.get("error") or data.get("message") or "provider failed"
                        print(f"[music_worker] ❌ provider failed: {err}")
                        await db.execute(
                            update(Track)
                            .where(Track.id == task_id)
                            .values(status="FAILED", error=str(err))
                        )
                        await db.commit()
                        return

                    # 아직 처리 중이면 backoff 후 재시도
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 1.5, 10.0)

                # 4) 타임아웃
                err_msg = "timeout waiting for music generation"
                print(f"[music_worker] ⏰ {err_msg}")
                await db.execute(
                    update(Track)
                    .where(Track.id == task_id)
                    .values(status="FAILED", error=err_msg)
                )
                await db.commit()

        except Exception as e:
            err_msg = f"exception: {e}"
            print(f"[music_worker] 💥 예외 발생: {err_msg}")
            await db.execute(
                update(Track)
                .where(Track.id == task_id)
                .values(status="FAILED", error=err_msg)
            )
            await db.commit()
            # 필요 시 DLQ로 재전송 가능


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
                    print(f"[music_worker] 📩 새 메시지 수신 - offset={msg.offset}, key={msg.key}, value={msg.value}")
                    await handle_message(msg.value)
                    await consumer.commit()
    finally:
        await consumer.stop()


if __name__ == "__main__":
    asyncio.run(main())
