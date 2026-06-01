"""Pure stats computations for the dashboard: difficulty breakdown, streaks,
and recent activity. No I/O so it is trivially unit testable.

Input is the list of manifest entries (see ``github_sync``), each shaped like::

    {"frontend_id", "title", "slug", "difficulty", "folder",
     "lang_display", "solved_at"}  # solved_at is an ISO date string

``today`` is passed in explicitly so tests are deterministic.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta

DIFFICULTIES = ("Easy", "Medium", "Hard")


def _parse(value) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def current_streak(days: set[date], today: date) -> int:
    """Consecutive solve-days ending today (or yesterday, so it isn't broken
    just because you haven't solved yet today)."""
    if not days:
        return 0
    cursor = today
    if cursor not in days:
        cursor = today - timedelta(days=1)
        if cursor not in days:
            return 0
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def longest_streak(days: set[date]) -> int:
    if not days:
        return 0
    ordered = sorted(days)
    longest = best = 1
    for prev, cur in zip(ordered, ordered[1:]):
        if cur - prev == timedelta(days=1):
            best += 1
            longest = max(longest, best)
        else:
            best = 1
    return longest


def compute_stats(problems: list[dict], today: date, activity_days: int = 30) -> dict:
    """Aggregate stats for the extension dashboard."""
    by_difficulty = {d: 0 for d in DIFFICULTIES}
    day_counts: Counter[date] = Counter()
    solve_days: set[date] = set()

    for p in problems:
        diff = p.get("difficulty")
        if diff in by_difficulty:
            by_difficulty[diff] += 1
        solved = _parse(p.get("solved_at"))
        if solved:
            day_counts[solved] += 1
            solve_days.add(solved)

    activity = [
        {
            "date": (today - timedelta(days=offset)).isoformat(),
            "count": day_counts.get(today - timedelta(days=offset), 0),
        }
        for offset in range(activity_days - 1, -1, -1)
    ]

    recent = sorted(
        (p for p in problems if p.get("solved_at")),
        key=lambda p: str(p["solved_at"]),
        reverse=True,
    )[:5]

    return {
        "total": len(problems),
        "byDifficulty": by_difficulty,
        "currentStreak": current_streak(solve_days, today),
        "longestStreak": longest_streak(solve_days),
        "activeDays": len(solve_days),
        "activity": activity,
        "recent": recent,
    }
