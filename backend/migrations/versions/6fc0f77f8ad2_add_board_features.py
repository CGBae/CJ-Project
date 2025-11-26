"""Add board features

Revision ID: 6fc0f77f8ad2
Revises: f0845d31e1c0
Create Date: 2025-11-26 14:50:47.369486
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6fc0f77f8ad2'
down_revision: Union[str, Sequence[str], None] = 'f0845d31e1c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. nullable=True로 컬럼 추가
    op.add_column('connections', sa.Column('initiator_id', sa.BigInteger(), nullable=True))

    # 2. 기존 데이터는 initiator_id = therapist_id 로 세팅
    op.execute("UPDATE connections SET initiator_id = therapist_id")

    # 3. nullable=False로 변경
    op.alter_column(
    'connections',
    'initiator_id',
    existing_type=sa.BigInteger(),
    nullable=False
)

    # 4. 외래키 추가 (명시적 이름 사용)
    op.create_foreign_key(
        'fk_connections_initiator',
        'connections',
        'users',
        ['initiator_id'],
        ['id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('fk_connections_initiator', 'connections', type_='foreignkey')
    op.drop_column('connections', 'initiator_id')
