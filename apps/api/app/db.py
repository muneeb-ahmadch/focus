import os

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        database_url = os.environ.get("DATABASE_URL", "sqlite:///./focus_dev.db")
        connect_args = {}
        engine_kwargs = {}
        if database_url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
            if database_url == "sqlite://":
                engine_kwargs["poolclass"] = StaticPool
        _engine = create_engine(database_url, connect_args=connect_args, **engine_kwargs)
    return _engine


def init_db() -> None:
    SQLModel.metadata.create_all(get_engine())
