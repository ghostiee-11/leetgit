from datetime import date

from leetgit import stats


def _p(fid, diff, solved_at):
    return {
        "frontend_id": fid,
        "title": f"P{fid}",
        "slug": f"p{fid}",
        "difficulty": diff,
        "folder": f"{fid}-p{fid}",
        "lang_display": "Python3",
        "solved_at": solved_at,
    }


def test_breakdown_counts():
    problems = [_p("1", "Easy", "2026-05-01"), _p("2", "Medium", "2026-05-02"), _p("3", "Easy", "2026-05-02")]
    result = stats.compute_stats(problems, date(2026, 5, 2))
    assert result["total"] == 3
    assert result["byDifficulty"] == {"Easy": 2, "Medium": 1, "Hard": 0}


def test_current_streak_counts_today_back():
    problems = [_p("1", "Easy", "2026-05-30"), _p("2", "Easy", "2026-05-31"), _p("3", "Easy", "2026-06-01")]
    result = stats.compute_stats(problems, date(2026, 6, 1))
    assert result["currentStreak"] == 3


def test_current_streak_allows_yesterday():
    problems = [_p("1", "Easy", "2026-05-31")]
    # haven't solved today yet, streak should still be 1
    result = stats.compute_stats(problems, date(2026, 6, 1))
    assert result["currentStreak"] == 1


def test_current_streak_breaks_on_gap():
    problems = [_p("1", "Easy", "2026-05-20")]
    result = stats.compute_stats(problems, date(2026, 6, 1))
    assert result["currentStreak"] == 0


def test_longest_streak():
    problems = [
        _p("1", "Easy", "2026-05-01"),
        _p("2", "Easy", "2026-05-02"),
        _p("3", "Easy", "2026-05-03"),
        _p("4", "Easy", "2026-05-10"),  # gap
    ]
    result = stats.compute_stats(problems, date(2026, 6, 1))
    assert result["longestStreak"] == 3


def test_activity_window_length_and_counts():
    problems = [_p("1", "Easy", "2026-06-01"), _p("2", "Medium", "2026-06-01")]
    result = stats.compute_stats(problems, date(2026, 6, 1), activity_days=7)
    assert len(result["activity"]) == 7
    assert result["activity"][-1] == {"date": "2026-06-01", "count": 2}


def test_recent_sorted_desc_and_capped():
    problems = [_p(str(i), "Easy", f"2026-05-{i:02d}") for i in range(1, 9)]
    result = stats.compute_stats(problems, date(2026, 6, 1))
    assert len(result["recent"]) == 5
    assert result["recent"][0]["solved_at"] == "2026-05-08"
