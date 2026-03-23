"""
Prometheon Data Models — Users, Tenants, and Test Results.

Schema design:
  - tenant is the isolation boundary (multi-tenancy key)
  - users belong to exactly one tenant
  - test_results store RCA analysis outputs, scoped to tenant
  - chaos_configs store saved fault injection presets
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, Float, Integer, Boolean, DateTime,
    ForeignKey, Text, JSON, Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


def utcnow():
    return datetime.now(timezone.utc)


def new_uuid():
    return uuid.uuid4()


# ---------------------------------------------------------------------------
# Tenant
# ---------------------------------------------------------------------------
class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    name = Column(String(120), nullable=False)
    slug = Column(String(60), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # relationships
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    test_results = relationship("TestResult", back_populates="tenant", cascade="all, delete-orphan")
    chaos_configs = relationship("ChaosConfig", back_populates="tenant", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Tenant {self.slug}>"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(80), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="member")  # owner | admin | member
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    last_login = Column(DateTime(timezone=True), nullable=True)

    # relationships
    tenant = relationship("Tenant", back_populates="users")

    def __repr__(self):
        return f"<User {self.username}>"


# ---------------------------------------------------------------------------
# Test Result (persisted RCA analysis)
# ---------------------------------------------------------------------------
class TestResult(Base):
    __tablename__ = "test_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    test_id = Column(String(80), nullable=False)  # e.g. test_20260316_203415
    service = Column(String(80), nullable=False)
    status = Column(String(20), nullable=False)  # success | failed
    error_rate = Column(Float, default=0.0)
    total_traces = Column(Integer, default=0)
    failed_traces = Column(Integer, default=0)
    root_causes = Column(JSON, default=list)  # full ranked list
    ai_summary = Column(Text, default="")
    recommendations = Column(JSON, default=list)
    time_window_minutes = Column(Integer, default=5)
    raw_response = Column(JSON, nullable=True)  # full API response for replay
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # relationships
    tenant = relationship("Tenant", back_populates="test_results")

    __table_args__ = (
        Index("ix_test_results_tenant_created", "tenant_id", "created_at"),
    )

    def __repr__(self):
        return f"<TestResult {self.test_id} ({self.status})>"


# ---------------------------------------------------------------------------
# Chaos Config (saved injection presets)
# ---------------------------------------------------------------------------
class ChaosConfig(Base):
    __tablename__ = "chaos_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    name = Column(String(120), nullable=False)
    description = Column(Text, default="")
    proxy = Column(String(80), nullable=False)  # e.g. a_to_b
    toxic_type = Column(String(40), nullable=False)  # latency, timeout, etc.
    attributes = Column(JSON, default=dict)  # {latency: 2000, jitter: 500}
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # relationships
    tenant = relationship("Tenant", back_populates="chaos_configs")

    def __repr__(self):
        return f"<ChaosConfig {self.name}>"
