from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'bc725ad4d1fc'
down_revision: Union[str, Sequence[str], None] = 'd1f1522770ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('users')]

    # age 컬럼이 없으면 추가
    if 'age' not in columns:
        op.add_column('users', sa.Column('age', sa.Integer(), nullable=True))

    # dob 컬럼이 있으면 삭제
    if 'dob' in columns:
        op.drop_column('users', 'dob')


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('users')]

    # dob 컬럼이 없으면 추가
    if 'dob' not in columns:
        op.add_column('users', sa.Column('dob', sa.DATE(), autoincrement=False, nullable=True))

    # age 컬럼이 있으면 삭제
    if 'age' in columns:
        op.drop_column('users', 'age')
