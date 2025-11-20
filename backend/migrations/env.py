import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# ---- 프로젝트 루트 경로 추가 ----
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, ".."))
sys.path.insert(0, project_root)

# 여기서 Base만 가져오고, 비동기 엔진은 건드리지 않게 만들기
from app.models import Base  # noqa: E402

# Alembic 설정 객체
config = context.config

# 로깅 설정
fileConfig(config.config_file_name)

# autogenerate에서 사용할 메타데이터
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """'offline' 모드에서 마이그레이션 실행 (DB 연결 X)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """'online' 모드에서 마이그레이션 실행 (DB 연결 O)."""

    # alembic.ini 의 [alembic] 섹션 가져오기
    configuration = config.get_section(config.config_ini_section) or {}

    db_url = os.getenv("ALEMBIC_DB_URL") or os.getenv("DATABASE_URL")
    if db_url:
        configuration["sqlalchemy.url"] = db_url

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()