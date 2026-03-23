"""Phase 2A — tenants, users, test results, chaos configs

Revision ID: 001_phase2a_init
Revises: None
Create Date: 2026-03-16
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "001_phase2a_init"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- tenants --
    op.create_table(
        "tenants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("slug", sa.String(60), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tenants_slug", "tenants", ["slug"])

    # -- users --
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("username", sa.String(80), unique=True, nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), server_default="member"),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_username", "users", ["username"])

    # -- test_results --
    op.create_table(
        "test_results",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("test_id", sa.String(80), nullable=False),
        sa.Column("service", sa.String(80), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("error_rate", sa.Float(), server_default="0.0"),
        sa.Column("total_traces", sa.Integer(), server_default="0"),
        sa.Column("failed_traces", sa.Integer(), server_default="0"),
        sa.Column("root_causes", sa.JSON(), server_default="[]"),
        sa.Column("ai_summary", sa.Text(), server_default="''"),
        sa.Column("recommendations", sa.JSON(), server_default="[]"),
        sa.Column("time_window_minutes", sa.Integer(), server_default="5"),
        sa.Column("raw_response", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_test_results_tenant_created", "test_results", ["tenant_id", "created_at"])

    # -- chaos_configs --
    op.create_table(
        "chaos_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), server_default="''"),
        sa.Column("proxy", sa.String(80), nullable=False),
        sa.Column("toxic_type", sa.String(40), nullable=False),
        sa.Column("attributes", sa.JSON(), server_default="{}"),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("chaos_configs")
    op.drop_table("test_results")
    op.drop_table("users")
    op.drop_table("tenants")
