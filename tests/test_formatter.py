from leetgit import formatter
from leetgit.leetcode import Question, Submission


def _question(**kw) -> Question:
    defaults = dict(
        frontend_id="1",
        title="Two Sum",
        slug="two-sum",
        difficulty="Easy",
        content_html="<p>Given an array <code>nums</code>.</p>",
        tags=["Array", "Hash Table"],
    )
    defaults.update(kw)
    return Question(**defaults)


def _submission(**kw) -> Submission:
    defaults = dict(
        code="print('hi')",
        lang="python3",
        lang_display="Python3",
        runtime="40 ms",
        runtime_percentile=88.5,
        memory="16 MB",
        memory_percentile=55.0,
        timestamp=1700000000,
    )
    defaults.update(kw)
    return Submission(**defaults)


def test_lang_extension_maps_known_and_unknown():
    assert formatter.lang_extension("python3") == "py"
    assert formatter.lang_extension("CPP") == "cpp"
    assert formatter.lang_extension("brainfuck") == "txt"


def test_problem_folder_and_filename():
    assert formatter.problem_folder(_question()) == "1-two-sum"
    assert formatter.solution_filename(_submission()) == "solution.py"
    assert formatter.solution_filename(_submission(lang="java")) == "solution.java"


def test_question_to_markdown_strips_html():
    md = formatter.question_to_markdown("<p>Hello <strong>world</strong></p>")
    assert "Hello" in md and "world" in md
    assert "<p>" not in md


def test_build_problem_files_has_readme_and_solution():
    files = formatter.build_problem_files(_question(), _submission())
    assert set(files) == {"README.md", "solution.py"}
    readme = files["README.md"]
    assert "# 1. Two Sum" in readme
    assert "Easy" in readme
    assert "88.50%" in readme
    assert "## Notes" in readme
    assert files["solution.py"] == "print('hi')"


def test_merge_notes_preserves_user_notes():
    old = formatter.build_readme(_question(), _submission())
    edited = old.replace("_Add your notes here._", "My clever two-pointer insight.")
    new = formatter.build_readme(_question(), _submission(runtime="20 ms"))
    merged = formatter.merge_notes(edited, new)
    assert "My clever two-pointer insight." in merged
    assert "20 ms" in merged  # new stats kept


def test_merge_notes_ignores_default_stub():
    old = formatter.build_readme(_question(), _submission())
    new = formatter.build_readme(_question(), _submission(runtime="20 ms"))
    merged = formatter.merge_notes(old, new)
    assert merged == new


def test_build_index_counts_and_table():
    problems = [
        {"frontend_id": "1", "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy", "folder": "1-two-sum", "lang_display": "Python3"},
        {"frontend_id": "2", "title": "Add Two", "slug": "add-two", "difficulty": "Medium", "folder": "2-add-two", "lang_display": "Java"},
    ]
    index = formatter.build_index(problems)
    assert "Solved: 2" in index
    assert "Easy: 1" in index and "Medium: 1" in index
    assert "[Two Sum](1-two-sum/)" in index
