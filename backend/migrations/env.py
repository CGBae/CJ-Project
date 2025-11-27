import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# ---- 프로젝트 루트 경로 추가 ----
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, ".."))
sys.path.insert(0, project_root)

from app.models import Base  # noqa: E402

# Alembic 설정 객체
config = context.config

# logging 설정
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 대상 메타데이터 (모든 모델의 Base.metadata)
target_metadata = Base.metadata


def get_db_url() -> str:
    """
    DB URL 우선순위:
    1) 환경변수 ALEMBIC_DB_URL
    2) 환경변수 DATABASE_URL
    3) alembic.ini 의 sqlalchemy.url (fallback)
    """
    env_url = os.getenv("ALEMBIC_DB_URL") or os.getenv("DATABASE_URL")
    if env_url:
        return env_url
    return config.get_main_option("sqlalchemy.url")


def run_migrations_offline() -> None:
    """offline 모드 (SQL 출력 전용)"""
    url = get_db_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """online 모드 (실제 DB에 적용)"""
    # alembic.ini 의 섹션 설정 복사
    configuration = config.get_section(config.config_ini_section) or {}

    # 여기서 DB URL 강제로 override
    configuration["sqlalchemy.url"] = get_db_url()

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
