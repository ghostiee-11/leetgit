"""Pure formatting functions: no network, no disk, easy to unit test.

Turns a Question + Submission into the files that land in the repo, preserves
user-written notes across re-syncs, and builds the top-level progress index.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from markdownify import markdownify

from .leetcode import Question, Submission

# LeetCode internal language name -> source file extension.
LANG_EXT: dict[str, str] = {
    "python": "py",
    "python3": "py",
    "pythondata": "py",
    "cpp": "cpp",
    "c": "c",
    "java": "java",
    "csharp": "cs",
    "javascript": "js",
    "typescript": "ts",
    "php": "php",
    "swift": "swift",
    "kotlin": "kt",
    "dart": "dart",
    "golang": "go",
    "go": "go",
    "ruby": "rb",
    "scala": "scala",
    "rust": "rs",
    "racket": "rkt",
    "erlang": "erl",
    "elixir": "ex",
    "mysql": "sql",
    "mssql": "sql",
    "oraclesql": "sql",
    "postgresql": "sql",
    "bash": "sh",
}

NOTES_HEADING = "## Notes"
_DEFAULT_NOTES_BODY = "_Add your notes here._"


def lang_extension(lang: str) -> str:
    """File extension for a LeetCode language name, defaulting to 'txt'."""
    return LANG_EXT.get(lang.lower(), "txt")


def problem_folder(question: Question) -> str:
    """Repo folder name for a problem, e.g. '1-two-sum'."""
    return f"{question.frontend_id}-{question.slug}"


def solution_filename(submission: Submission) -> str:
    return f"solution.{lang_extension(submission.lang)}"


def question_to_markdown(html: str) -> str:
    """Convert LeetCode's HTML statement to Markdown."""
    if not html:
        return "_Problem statement unavailable._"
    md = markdownify(html, heading_style="ATX", bullets="-")
    # Collapse runs of 3+ blank lines down to a single blank line.
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md.strip()


def _pct(value: float | None) -> str:
    if value is None:
        return "N/A"
    return f"{value:.2f}%"


def build_readme(question: Question, submission: Submission) -> str:
    """Render the per-problem README with statement, stats and a notes stub."""
    when = "N/A"
    if submission.timestamp:
        when = datetime.fromtimestamp(submission.timestamp, tz=timezone.utc).strftime(
            "%Y-%m-%d %H:%M UTC"
        )
    tags = ", ".join(question.tags) if question.tags else "None"
    statement = question_to_markdown(question.content_html)
    sol_file = solution_filename(submission)

    return (
        f"# {question.frontend_id}. {question.title}\n\n"
        f"- **Difficulty:** {question.difficulty}\n"
        f"- **Tags:** {tags}\n"
        f"- **Link:** {question.url}\n\n"
        f"## Problem\n\n"
        f"{statement}\n\n"
        f"## Solution\n\n"
        f"- **Language:** {submission.lang_display}\n"
        f"- **Runtime:** {submission.runtime} (beats {_pct(submission.runtime_percentile)})\n"
        f"- **Memory:** {submission.memory} (beats {_pct(submission.memory_percentile)})\n"
        f"- **Submitted:** {when}\n\n"
        f"See [{sol_file}]({sol_file}).\n\n"
        f"{NOTES_HEADING}\n\n"
        f"{_DEFAULT_NOTES_BODY}\n"
    )


def build_problem_files(question: Question, submission: Submission) -> dict[str, str]:
    """Map of {filename: content} for one solved problem (README + solution)."""
    return {
        "README.md": build_readme(question, submission),
        solution_filename(submission): submission.code,
    }


def merge_notes(existing_readme: str, new_readme: str) -> str:
    """Carry the user's edited ``## Notes`` block from the old README into the new one.

    If the existing notes are empty or just the default stub, the new README is
    returned unchanged.
    """
    old_notes = _extract_notes(existing_readme)
    if old_notes is None or old_notes.strip() in ("", _DEFAULT_NOTES_BODY):
        return new_readme

    idx = new_readme.find(NOTES_HEADING)
    if idx == -1:
        # New README has no notes section; append the preserved one.
        return f"{new_readme.rstrip()}\n\n{NOTES_HEADING}\n\n{old_notes}\n"
    return f"{new_readme[:idx]}{NOTES_HEADING}\n\n{old_notes}\n"


def _extract_notes(readme: str) -> str | None:
    """Return the body after the ``## Notes`` heading, or None if absent."""
    idx = readme.find(NOTES_HEADING)
    if idx == -1:
        return None
    body = readme[idx + len(NOTES_HEADING):]
    # Notes is the last section, so take everything to the end of the file.
    return body.strip("\n").lstrip("\n").strip()


def build_index(problems: list[dict]) -> str:
    """Render the top-level progress README.

    Each problem dict needs: frontend_id, title, slug, difficulty, folder,
    lang_display.
    """
    def sort_key(p: dict):
        try:
            return (0, int(p["frontend_id"]))
        except (ValueError, TypeError):
            return (1, p["frontend_id"])

    rows = sorted(problems, key=sort_key)
    counts = {"Easy": 0, "Medium": 0, "Hard": 0}
    for p in rows:
        counts[p.get("difficulty", "")] = counts.get(p.get("difficulty", ""), 0) + 1

    lines = [
        "# LeetCode Solutions",
        "",
        "Auto-synced by [LeetGit](https://github.com/ghostiee-11/leetgit).",
        "",
        f"**Solved: {len(rows)}** "
        f"(Easy: {counts.get('Easy', 0)}, "
        f"Medium: {counts.get('Medium', 0)}, "
        f"Hard: {counts.get('Hard', 0)})",
        "",
        "| # | Title | Difficulty | Language |",
        "| --- | --- | --- | --- |",
    ]
    for p in rows:
        lines.append(
            f"| {p['frontend_id']} "
            f"| [{p['title']}]({p['folder']}/) "
            f"| {p.get('difficulty', '')} "
            f"| {p.get('lang_display', '')} |"
        )
    return "\n".join(lines) + "\n"
