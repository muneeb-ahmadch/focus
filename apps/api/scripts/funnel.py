import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import get_engine  # noqa: E402
from app.funnel import funnel_summary  # noqa: E402

if __name__ == "__main__":
    summary = funnel_summary(get_engine())
    for key, value in summary.items():
        print(f"{key}: {value}")
