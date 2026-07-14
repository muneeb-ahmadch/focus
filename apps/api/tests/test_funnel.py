"""Slice v11 gate: the funnel summary computes the M1/M2 gate metrics from the
event stream alone — installs, share of installs with >=3 mission_completed,
share with >=3 distinct study days inside their first week, and mock
started->completed rate."""

import uuid

import pytest

from app.db import get_engine
from app.funnel import funnel_summary


def event(name, occurred_at, props=None):
    return {
        "event_id": str(uuid.uuid4()),
        "name": name,
        "occurred_at": occurred_at,
        "props": props if props is not None else {},
    }


def seed(client):
    install_a = str(uuid.uuid4())
    install_b = str(uuid.uuid4())
    install_c = str(uuid.uuid4())

    # A: three missions on three distinct days in the first week; completes a mock
    res = client.post(
        "/v1/analytics",
        json={
            "install_id": install_a,
            "events": [
                event("app_open", "2026-07-01T08:00:00Z"),
                event("mission_completed", "2026-07-01T08:10:00Z", {"mission_id": "r1-m1"}),
                event("mission_completed", "2026-07-02T08:10:00Z", {"mission_id": "r1-m2"}),
                event("mission_completed", "2026-07-03T08:10:00Z", {"mission_id": "r1-m3"}),
                event("mock_started", "2026-07-03T09:00:00Z", {"kind": "real"}),
                event("mock_completed", "2026-07-03T10:00:00Z", {"kind": "real", "score": 44}),
            ],
        },
    )
    assert res.status_code == 200

    # B: one mission, one day; starts a mock but never finishes it
    res = client.post(
        "/v1/analytics",
        json={
            "install_id": install_b,
            "events": [
                event("app_open", "2026-07-01T09:00:00Z"),
                event("mission_completed", "2026-07-01T09:10:00Z", {"mission_id": "r1-m1"}),
                event("mock_started", "2026-07-01T10:00:00Z", {"kind": "real"}),
            ],
        },
    )
    assert res.status_code == 200

    # C: opened the app once, did nothing else
    res = client.post(
        "/v1/analytics",
        json={
            "install_id": install_c,
            "events": [event("app_open", "2026-07-05T09:00:00Z")],
        },
    )
    assert res.status_code == 200


def test_funnel_summary_computes_gate_metrics(client):
    seed(client)
    summary = funnel_summary(get_engine())
    assert summary["installs"] == 3
    assert summary["events"] == 10
    assert summary["ge3_missions_rate"] == pytest.approx(1 / 3)
    assert summary["ge3_study_days_week1_rate"] == pytest.approx(1 / 3)
    assert summary["mock_completion_rate"] == pytest.approx(1 / 2)


def test_study_days_window_is_the_first_seven_days(client):
    install = str(uuid.uuid4())
    # two days inside the first week, a third only after it — must NOT count
    res = client.post(
        "/v1/analytics",
        json={
            "install_id": install,
            "events": [
                event("app_open", "2026-07-01T08:00:00Z"),
                event("app_open", "2026-07-04T08:00:00Z"),
                event("app_open", "2026-07-20T08:00:00Z"),
            ],
        },
    )
    assert res.status_code == 200
    summary = funnel_summary(get_engine())
    assert summary["ge3_study_days_week1_rate"] == pytest.approx(0.0)


def test_empty_stream_yields_zeroes_and_no_rates(client):
    summary = funnel_summary(get_engine())
    assert summary["installs"] == 0
    assert summary["events"] == 0
    assert summary["ge3_missions_rate"] is None
    assert summary["ge3_study_days_week1_rate"] is None
    assert summary["mock_completion_rate"] is None
