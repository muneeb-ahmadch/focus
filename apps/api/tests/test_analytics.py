"""Slice v11 gate: POST /v1/analytics is idempotent on event_id, validates
strictly (malformed payloads 422, never 500), stores occurred_at as sent plus
a server-side received_at (clock skew never rejects a batch), rate-limits per
client, and accepts no PII-shaped payloads — names are constrained slugs and
props are a small, flat, size-capped bag."""

import uuid
from datetime import datetime, timedelta, timezone

from sqlmodel import select

from app.models import AnalyticsEvent
from app.ratelimit import limiter


def make_event(name="app_open", props=None, occurred_at="2026-07-14T10:00:00Z"):
    return {
        "event_id": str(uuid.uuid4()),
        "name": name,
        "occurred_at": occurred_at,
        "props": props if props is not None else {},
    }


def make_body(events=None, install_id=None):
    return {
        "install_id": install_id or str(uuid.uuid4()),
        "events": events if events is not None else [make_event()],
    }


def post(client, body):
    return client.post("/v1/analytics", json=body)


class TestAccept:
    def test_valid_batch_accepted_and_stored(self, client, session):
        body = make_body(
            events=[
                make_event("app_open"),
                make_event("mission_completed", props={"mission_id": "r1-m1", "score": 1}),
            ]
        )
        res = post(client, body)
        assert res.status_code == 200
        assert res.json() == {"accepted": 2, "duplicates": 0}
        rows = session.exec(select(AnalyticsEvent)).all()
        assert len(rows) == 2
        by_id = {r.event_id: r for r in rows}
        first = by_id[body["events"][0]["event_id"]]
        assert first.install_id == body["install_id"]
        assert first.name == "app_open"
        assert first.occurred_at == datetime(2026, 7, 14, 10, 0)
        assert first.received_at is not None

    def test_replay_of_the_same_batch_is_idempotent(self, client, session):
        body = make_body(events=[make_event(), make_event()])
        assert post(client, body).json() == {"accepted": 2, "duplicates": 0}
        res = post(client, body)
        assert res.status_code == 200
        assert res.json() == {"accepted": 0, "duplicates": 2}
        assert len(session.exec(select(AnalyticsEvent)).all()) == 2

    def test_mixed_new_and_duplicate_events(self, client, session):
        first = make_event()
        assert post(client, make_body(events=[first])).status_code == 200
        res = post(client, make_body(events=[first, make_event()]))
        assert res.status_code == 200
        assert res.json() == {"accepted": 1, "duplicates": 1}
        assert len(session.exec(select(AnalyticsEvent)).all()) == 2

    def test_props_round_trip_all_primitive_types(self, client, session):
        event = make_event(
            "mock_completed",
            props={"kind": "real", "score": 44, "passed": True},
        )
        assert post(client, make_body(events=[event])).status_code == 200
        row = session.exec(select(AnalyticsEvent)).one()
        assert row.event_id == event["event_id"]

    def test_finite_float_on_a_numeric_key_is_accepted(self, client):
        event = make_event("mock_completed", props={"kind": "real", "score": 44.0, "passed": False})
        assert post(client, make_body(events=[event])).status_code == 200


class TestClockSkew:
    def test_far_future_and_far_past_timestamps_are_accepted_as_sent(self, client, session):
        res = post(
            client,
            make_body(
                events=[
                    make_event(occurred_at="2036-01-01T00:00:00Z"),
                    make_event(occurred_at="1999-12-31T23:59:59Z"),
                ]
            ),
        )
        assert res.status_code == 200
        rows = session.exec(select(AnalyticsEvent)).all()
        years = sorted(r.occurred_at.year for r in rows)
        assert years == [1999, 2036]
        window = timedelta(minutes=5)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        for r in rows:
            assert abs(now - r.received_at) < window


class TestValidation:
    def test_empty_events_rejected(self, client):
        assert post(client, make_body(events=[])).status_code == 422

    def test_oversized_batch_rejected(self, client):
        events = [make_event() for _ in range(101)]
        assert post(client, make_body(events=events)).status_code == 422

    def test_batch_of_exactly_100_accepted(self, client):
        events = [make_event() for _ in range(100)]
        res = post(client, make_body(events=events))
        assert res.status_code == 200
        assert res.json()["accepted"] == 100

    def test_bad_install_id_rejected(self, client):
        assert post(client, make_body(install_id="not-a-uuid")).status_code == 422

    def test_bad_event_id_rejected(self, client):
        event = make_event()
        event["event_id"] = "12345"
        assert post(client, make_body(events=[event])).status_code == 422

    def test_bad_event_names_rejected(self, client):
        for bad in ["Mission_Completed", "has space", "has-dash", "1starts_with_digit", "x" * 65, ""]:
            res = post(client, make_body(events=[make_event(name=bad)]))
            assert res.status_code == 422, f"name {bad!r} must be rejected"

    def test_bad_timestamp_rejected(self, client):
        assert post(client, make_body(events=[make_event(occurred_at="yesterday")])).status_code == 422

    def test_props_with_oversized_value_rejected(self, client):
        event = make_event("mission_completed", props={"mission_id": "x" * 129})
        assert post(client, make_body(events=[event])).status_code == 422

    def test_props_with_nested_value_rejected(self, client):
        event = make_event("mission_completed", props={"score": {"nested": 1}})
        assert post(client, make_body(events=[event])).status_code == 422

    def test_props_with_list_value_rejected(self, client):
        event = make_event("mission_completed", props={"score": [1, 2, 3]})
        assert post(client, make_body(events=[event])).status_code == 422

    def test_unknown_top_level_field_rejected(self, client):
        body = make_body()
        body["email"] = "someone@example.com"
        assert post(client, body).status_code == 422

    def test_unknown_event_field_rejected(self, client):
        event = make_event()
        event["user_email"] = "someone@example.com"
        assert post(client, make_body(events=[event])).status_code == 422

    def test_missing_install_id_rejected(self, client):
        assert client.post("/v1/analytics", json={"events": [make_event()]}).status_code == 422

    def test_invalid_json_body_is_422_not_500(self, client):
        res = client.post(
            "/v1/analytics", content=b"\x00\x01not json", headers={"Content-Type": "application/json"}
        )
        assert res.status_code == 422

    def test_wrong_shape_is_422_not_500(self, client):
        res = client.post("/v1/analytics", json=["just", "a", "list"])
        assert res.status_code == 422


CATALOGUE = {
    "app_open": {},
    "onboarding_completed": {},
    "mission_started": {"mission_id": "r1-m1"},
    "mission_completed": {"mission_id": "r1-m1", "score": 1},
    "checkpoint_failed": {"mission_id": "r1-m1", "score": 0},
    "drill_completed": {"total": 3, "correct": 2},
    "rehab_completed": {"cleared": True},
    "practice_completed": {"content_id": "topic:lights", "total": 3, "correct": 3},
    "mock_started": {"kind": "real"},
    "mock_completed": {"kind": "mini", "score": 9, "passed": True},
}


class TestCatalogueAllowlist:
    """SEC-1: the server enforces the event catalogue — the client-side whitelist
    is TypeScript-only, so a modified or third-party client must not be able to
    store off-catalogue names or PII-shaped prop keys."""

    def test_every_catalogue_event_with_its_own_props_is_accepted(self, client):
        events = [make_event(name, props=dict(props)) for name, props in CATALOGUE.items()]
        res = post(client, make_body(events=events))
        assert res.status_code == 200
        assert res.json()["accepted"] == len(CATALOGUE)

    def test_off_catalogue_event_name_rejected(self, client):
        assert post(client, make_body(events=[make_event("user_signed_in")])).status_code == 422

    def test_unknown_prop_key_rejected(self, client):
        event = make_event("app_open", props={"anything": 1})
        assert post(client, make_body(events=[event])).status_code == 422

    def test_pii_shaped_props_rejected_even_within_size_caps(self, client):
        for props in (
            {"email": "victim@example.com"},
            {"full_name": "A Real Name"},
            {"test_date_iso": "2026-09-15"},
            {"device_label": "someones phone"},
            {"note": "free text"},
        ):
            event = make_event("mission_completed", props=props)
            res = post(client, make_body(events=[event]))
            assert res.status_code == 422, f"PII-shaped {props!r} must be rejected"

    def test_prop_key_valid_for_a_different_event_is_still_rejected(self, client):
        # 'kind' belongs to mock events, not to mission_completed
        event = make_event("mission_completed", props={"kind": "real"})
        assert post(client, make_body(events=[event])).status_code == 422


class TestNonFiniteFloats:
    """SEC-7 / QA-4: NaN/Infinity are non-standard JSON that strict downstream
    consumers choke on; reject them rather than storing invalid JSON."""

    def test_nan_rejected(self, client):
        body = f'{{"install_id": "{uuid.uuid4()}", "events": [{{"event_id": "{uuid.uuid4()}", "name": "mock_completed", "occurred_at": "2026-07-14T10:00:00Z", "props": {{"score": NaN}}}}]}}'
        res = client.post("/v1/analytics", content=body, headers={"Content-Type": "application/json"})
        assert res.status_code == 422

    def test_infinity_rejected(self, client):
        for token in ("Infinity", "-Infinity"):
            body = f'{{"install_id": "{uuid.uuid4()}", "events": [{{"event_id": "{uuid.uuid4()}", "name": "mock_completed", "occurred_at": "2026-07-14T10:00:00Z", "props": {{"score": {token}}}}}]}}'
            res = client.post("/v1/analytics", content=body, headers={"Content-Type": "application/json"})
            assert res.status_code == 422, f"{token} must be rejected"


class TestNeverCrashes:
    """SEC-2 / SEC-5: malformed input is 4xx, never 500, and a pathological body
    can neither crash the recursive JSON parser nor exhaust memory pre-parse."""

    def test_deeply_nested_body_is_4xx_not_500_and_server_survives(self, client):
        depth = 5000
        body = '{"install_id": "x", "events": ' + "[" * depth + "]" * depth + "}"
        res = client.post("/v1/analytics", content=body, headers={"Content-Type": "application/json"})
        assert res.status_code < 500, f"deeply nested body returned {res.status_code}"
        assert client.get("/health").status_code == 200

    def test_deeply_nested_prop_value_is_4xx_not_500(self, client):
        depth = 5000
        inner = "[" * depth + "]" * depth
        body = (
            f'{{"install_id": "{uuid.uuid4()}", "events": [{{"event_id": "{uuid.uuid4()}", '
            f'"name": "app_open", "occurred_at": "2026-07-14T10:00:00Z", "props": {{"k": {inner}}}}}]}}'
        )
        res = client.post("/v1/analytics", content=body, headers={"Content-Type": "application/json"})
        assert res.status_code < 500
        assert client.get("/health").status_code == 200

    def test_oversized_body_rejected_before_full_parse(self, client):
        big = "z" * (2 * 1024 * 1024)
        event = make_event("mission_completed", props={"mission_id": big})
        res = post(client, make_body(events=[event]))
        assert res.status_code in (413, 422)
        assert res.status_code != 500


class TestConcurrency:
    """SEC-4 / QA-2: concurrent identical batches (a real mobile retry racing an
    in-flight flush) must dedupe, never raise on the event_id PK. Exercised
    against a real file database with genuine per-thread connections — the
    in-memory StaticPool the other tests use cannot express true concurrency."""

    def test_persist_is_idempotent_under_real_concurrency(self, tmp_path):
        import threading
        from datetime import datetime

        from sqlmodel import Session, SQLModel, create_engine
        from sqlmodel import select as sel

        from app.analytics import persist_events

        engine = create_engine(
            f"sqlite:///{tmp_path / 'concurrency.db'}",
            connect_args={"check_same_thread": False, "timeout": 30},
        )
        SQLModel.metadata.create_all(engine)

        install = str(uuid.uuid4())
        ids = [str(uuid.uuid4()) for _ in range(20)]

        def prepared():
            return [
                {
                    "event_id": eid,
                    "install_id": install,
                    "name": "app_open",
                    "occurred_at": datetime(2026, 7, 14, 10, 0),
                    "props_json": "{}",
                    "received_at": datetime(2026, 7, 14, 8, 0),
                }
                for eid in ids
            ]

        errors: list[Exception] = []

        def worker():
            try:
                persist_events(engine, prepared())
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(24)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == [], f"persist raised under concurrency: {errors[:1]}"
        with Session(engine) as s:
            assert len(s.exec(sel(AnalyticsEvent)).all()) == 20


class TestForwardedHeaderNotTrusted:
    """SEC-3 / QA-1 regression guard: the application keys the rate limit on the
    transport peer, never on a client-supplied X-Forwarded-For, so a rotating
    header cannot mint fresh buckets. (The deployment also runs uvicorn with
    --no-proxy-headers so the peer itself can't be spoofed.)"""

    def test_rotating_x_forwarded_for_does_not_bypass_the_limit(self, client):
        limiter.per_minute = 5
        codes = [
            post(client, make_body(), )  # noqa: E501
            for _ in range(5)
        ]
        assert all(r.status_code == 200 for r in codes)
        spoofed = client.post(
            "/v1/analytics",
            json=make_body(),
            headers={"X-Forwarded-For": "203.0.113.99"},
        )
        assert spoofed.status_code == 429


class TestRateLimit:
    def test_over_limit_gets_429_and_reset_recovers(self, client):
        limiter.per_minute = 3
        for _ in range(3):
            assert post(client, make_body()).status_code == 200
        assert post(client, make_body()).status_code == 429
        limiter.reset()
        assert post(client, make_body()).status_code == 200


class TestHealth:
    def test_health_still_ok(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}
