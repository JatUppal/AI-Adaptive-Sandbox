"""
Prometheon Auth Utilities — JWT creation/validation + password hashing.

Uses:
  - bcrypt for password hashing (via passlib)
  - python-jose for JWT encode/decode
  - Pydantic for request/response schemas
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "prometheon_dev_secret_change_in_prod")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------
def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
def create_access_token(
    user_id: str,
    tenant_id: str,
    username: str,
    role: str = "member",
    expires_delta: Optional[timedelta] = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "username": username,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=6, max_length=128)
    tenant_name: Optional[str] = Field(
        default=None,
        description="If provided, creates a new tenant. Otherwise joins 'default'.",
    )


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    role: str
    tenant_id: str
    tenant_name: str


# ---------------------------------------------------------------------------
# FastAPI dependency — extract current user from Bearer token
# ---------------------------------------------------------------------------
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Decode JWT, verify user still exists + is active.
    Returns dict with user_id, tenant_id, username, role.
    """
    payload = decode_access_token(credentials.credentials)

    # Lazy import to avoid circular dependency
    from models import User

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")

    return {
        "user_id": str(user.id),
        "tenant_id": str(user.tenant_id),
        "username": user.username,
        "role": user.role,
    }
