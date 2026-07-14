import os

os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete

from app.db import get_engine, init_db
from app.main import app
from app.models import AnalyticsEvent
from app.ratelimit import limiter


@pytest.fixture()
def client():
    init_db()
    limiter.reset()
    limiter.per_minute = 10_000
    with Session(get_engine()) as session:
        session.exec(delete(AnalyticsEvent))
        session.commit()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def session():
    with Session(get_engine()) as s:
        yield s
