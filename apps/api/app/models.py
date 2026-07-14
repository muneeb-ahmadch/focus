from datetime import datetime

from sqlmodel import Field, SQLModel


class AnalyticsEvent(SQLModel, table=True):
    __tablename__ = "analytics_event"

    event_id: str = Field(primary_key=True)
    install_id: str = Field(index=True)
    name: str
    occurred_at: datetime
    props_json: str = Field(default="{}")
    received_at: datetime
