"""
Prometheon Database Layer — SQLAlchemy async engine + session factory.

Usage:
    from database import get_db, engine
    
    @app.post("/endpoint")
    async def endpoint(db: AsyncSession = Depends(get_db)):
        ...
"""

import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://prometheon:prometheon_dev@localhost:5432/prometheon",
)

# Convert postgresql:// to postgresql+asyncpg:// for async driver
if DATABASE_URL.startswith("postgresql://"):
    ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
else:
    ASYNC_DATABASE_URL = DATABASE_URL

engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=5,
    pool_pre_ping=True,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def get_db():
    """FastAPI dependency — yields an AsyncSession, auto-closes on exit."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables (dev convenience — use Alembic in production)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """Dispose engine on shutdown."""
    await engine.dispose()
