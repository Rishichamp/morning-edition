"""The knowledge base: one line of JSON per story that made it into an edition.
It lets each new edition see what was reported before, for "What changed since yesterday"."""
import json
import os
from datetime import date, timedelta

PATH = os.path.join(os.path.dirname(__file__), "..", "kb", "stories.jsonl")


def load(days=7, today=None):
    if not os.path.exists(PATH):
        return []
    today = today or date.today()
    since = (today - timedelta(days=days)).isoformat()
    rows = []
    with open(PATH, encoding="utf8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                if since <= r.get("date", "") < today.isoformat():
                    rows.append(r)
    return rows


def add(rows, keep_days=60, today=None):
    """Append today's stories, drop entries older than keep_days, and never store the same day twice."""
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    today = today or date.today()
    oldest = (today - timedelta(days=keep_days)).isoformat()
    new_dates = {r["date"] for r in rows}
    kept = []
    if os.path.exists(PATH):
        with open(PATH, encoding="utf8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                if r.get("date", "") >= oldest and r.get("date") not in new_dates:
                    kept.append(r)
    with open(PATH, "w", encoding="utf8") as f:
        for r in kept + rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
