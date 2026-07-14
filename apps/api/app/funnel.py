from collections import defaultdict
from datetime import timedelta

from sqlmodel import Session, select

from app.models import AnalyticsEvent


def funnel_summary(engine) -> dict:
    with Session(engine) as session:
        rows = session.exec(select(AnalyticsEvent)).all()

    by_install: dict[str, list[AnalyticsEvent]] = defaultdict(list)
    for row in rows:
        by_install[row.install_id].append(row)

    total_installs = len(by_install)
    total_events = len(rows)

    if total_installs == 0:
        ge3_missions_rate = None
        ge3_study_days_week1_rate = None
    else:
        ge3_missions = 0
        ge3_study_days = 0
        for install_rows in by_install.values():
            mission_count = sum(1 for r in install_rows if r.name == "mission_completed")
            if mission_count >= 3:
                ge3_missions += 1

            first_date = min(r.occurred_at for r in install_rows).date()
            window_end = first_date + timedelta(days=6)
            distinct_days = {
                r.occurred_at.date()
                for r in install_rows
                if first_date <= r.occurred_at.date() <= window_end
            }
            if len(distinct_days) >= 3:
                ge3_study_days += 1

        ge3_missions_rate = ge3_missions / total_installs
        ge3_study_days_week1_rate = ge3_study_days / total_installs

    mock_started = sum(1 for r in rows if r.name == "mock_started")
    mock_completed = sum(1 for r in rows if r.name == "mock_completed")
    mock_completion_rate = mock_completed / mock_started if mock_started > 0 else None

    return {
        "installs": total_installs,
        "events": total_events,
        "ge3_missions_rate": ge3_missions_rate,
        "ge3_study_days_week1_rate": ge3_study_days_week1_rate,
        "mock_completion_rate": mock_completion_rate,
    }
