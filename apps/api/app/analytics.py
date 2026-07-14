import json
import math
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.db import get_engine
from app.models import AnalyticsEvent
from app.ratelimit import rate_limit

router = APIRouter()

# The server enforces the client's event catalogue: unknown event names and
# off-catalogue prop keys are rejected. The mobile whitelist is TypeScript-only,
# so this is the real "no PII by construction" control against a modified or
# third-party client hitting the unauthenticated endpoint.
EVENT_PROPS: dict[str, frozenset[str]] = {
    "app_open": frozenset(),
    "onboarding_completed": frozenset(),
    "mission_started": frozenset({"mission_id"}),
    "mission_completed": frozenset({"mission_id", "score"}),
    "checkpoint_failed": frozenset({"mission_id", "score"}),
    "drill_completed": frozenset({"total", "correct"}),
    "rehab_completed": frozenset({"cleared"}),
    "practice_completed": frozenset({"content_id", "total", "correct"}),
    "mock_started": frozenset({"kind"}),
    "mock_completed": frozenset({"kind", "score", "passed"}),
}


def _validate_props(props: dict) -> dict:
    if len(props) > 10:
        raise ValueError("props may contain at most 10 keys")
    for key, value in props.items():
        if not isinstance(key, str) or len(key) > 64:
            raise ValueError("prop keys must be strings of length <= 64")
        if isinstance(value, bool):
            continue
        if isinstance(value, str):
            if len(value) > 128:
                raise ValueError("prop string values must be <= 128 chars")
            continue
        if isinstance(value, int):
            continue
        if isinstance(value, float):
            if not math.isfinite(value):
                raise ValueError("prop float values must be finite")
            continue
        raise ValueError("prop values must be str, int, float, or bool")
    return props


class Event(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: uuid.UUID
    name: str
    occurred_at: datetime
    props: dict = Field(default_factory=dict)

    @field_validator("props")
    @classmethod
    def _check_props(cls, v: dict) -> dict:
        return _validate_props(v)

    @model_validator(mode="after")
    def _check_catalogue(self) -> "Event":
        allowed = EVENT_PROPS.get(self.name)
        if allowed is None:
            raise ValueError(f"unknown event name: {self.name}")
        unknown = set(self.props) - allowed
        if unknown:
            raise ValueError(f"props {sorted(unknown)} not allowed for {self.name}")
        return self


class Batch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    install_id: uuid.UUID
    events: list[Event] = Field(min_length=1, max_length=100)


def _to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def persist_events(engine, prepared: list[dict]) -> int:
    """Insert each event under its own savepoint so a duplicate event_id (a
    concurrent request that already landed the same row) rolls back only that
    one row and is counted as a duplicate — never an unhandled IntegrityError.
    Returns the number of rows actually inserted."""
    inserted = 0
    with Session(engine) as session:
        for row in prepared:
            try:
                with session.begin_nested():
                    session.add(AnalyticsEvent(**row))
                    session.flush()
                inserted += 1
            except IntegrityError:
                pass
        session.commit()
    return inserted


@router.post("/v1/analytics")
def ingest(batch: Batch, _: None = Depends(rate_limit)) -> dict[str, int]:
    received_at = datetime.now(timezone.utc).replace(tzinfo=None)

    prepared: dict[str, dict] = {}
    for event in batch.events:
        event_id = str(event.event_id)
        if event_id in prepared:
            continue
        prepared[event_id] = {
            "event_id": event_id,
            "install_id": str(batch.install_id),
            "name": event.name,
            "occurred_at": _to_naive_utc(event.occurred_at),
            "props_json": json.dumps(event.props),
            "received_at": received_at,
        }

    accepted = persist_events(get_engine(), list(prepared.values()))
    return {"accepted": accepted, "duplicates": len(batch.events) - accepted}
