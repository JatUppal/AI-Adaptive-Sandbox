"""
Prometheon Auth Routes — /auth/register, /auth/login, /auth/me
"""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Tenant
from auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def slugify(name: str) -> str:
    """Convert tenant name to URL-safe slug."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:60]


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------
@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Create a new user (and optionally a new tenant).
    If tenant_name is provided, creates tenant + user as owner.
    Otherwise, joins the 'default' tenant as a member.
    """
    # Check if username or email already taken
    existing = await db.execute(
        select(User).where((User.email == req.email) | (User.username == req.username))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already registered",
        )

    # Resolve or create tenant
    if req.tenant_name:
        slug = slugify(req.tenant_name)
        existing_tenant = await db.execute(
            select(Tenant).where(Tenant.slug == slug)
        )
        if existing_tenant.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Tenant '{req.tenant_name}' already exists",
            )
        tenant = Tenant(name=req.tenant_name, slug=slug)
        db.add(tenant)
        await db.flush()  # get tenant.id
        role = "owner"
    else:
        # Join or create "default" tenant
        result = await db.execute(select(Tenant).where(Tenant.slug == "default"))
        tenant = result.scalar_one_or_none()
        if not tenant:
            tenant = Tenant(name="Default", slug="default")
            db.add(tenant)
            await db.flush()
        role = "member"

    # Create user
    user = User(
        tenant_id=tenant.id,
        email=req.email,
        username=req.username,
        hashed_password=hash_password(req.password),
        role=role,
    )
    db.add(user)
    await db.flush()

    # Generate token
    token = create_access_token(
        user_id=str(user.id),
        tenant_id=str(tenant.id),
        username=user.username,
        role=role,
    )

    return TokenResponse(
        access_token=token,
        user={
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "role": role,
            "tenant_id": str(tenant.id),
            "tenant_name": tenant.name,
        },
    )


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------
@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user with username + password, return JWT."""
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account deactivated",
        )

    # Update last_login
    user.last_login = datetime.now(timezone.utc)
    await db.flush()

    # Load tenant name
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = tenant_result.scalar_one()

    token = create_access_token(
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        username=user.username,
        role=user.role,
    )

    return TokenResponse(
        access_token=token,
        user={
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "role": user.role,
            "tenant_id": str(user.tenant_id),
            "tenant_name": tenant.name,
        },
    )


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------
@router.get("/me", response_model=UserResponse)
async def me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current authenticated user's profile."""
    result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = tenant_result.scalar_one()

    return UserResponse(
        id=str(user.id),
        email=user.email,
        username=user.username,
        role=user.role,
        tenant_id=str(user.tenant_id),
        tenant_name=tenant.name,
    )
