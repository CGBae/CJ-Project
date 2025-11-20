# app/kafka.py
import json, os
from aiokafka import AIOKafkaProducer

producer: AIOKafkaProducer | None = None

async def start_kafka():
    global producer
    producer = AIOKafkaProducer(
        bootstrap_servers=os.getenv("KAFKA_BOOTSTRAP", "redpanda:9092"),
        value_serializer=lambda v: json.dumps(v).encode(),
        key_serializer=lambda v: str(v).encode(),
        linger_ms=5,
        acks="all",
        enable_idempotence=True,
    )
    await producer.start()

async def stop_kafka():
    if producer:
        await producer.stop()
