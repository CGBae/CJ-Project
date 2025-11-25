"""Initial migration after lost revisions

Revision ID: d1f1522770ab
Revises: f0845d31e1c0
Create Date: 2025-11-25 15:22:43.686823

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1f1522770ab'
down_revision: Union[str, Sequence[str], None] = 'f0845d31e1c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
