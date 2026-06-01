"""Push solved problems to a GitHub repo via the API (no local clone needed).

A single sync writes the problem folder (README + solution), updates a small
JSON manifest, and regenerates the top-level index README, all in one commit
using the Git Data API. User notes in an existing README are preserved.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from github import Github, GithubException, InputGitTreeElement

from . import formatter
from .leetcode import Question, Submission

MANIFEST_PATH = ".leetgit/solved.json"


class GithubSyncError(RuntimeError):
    """Raised when the GitHub side of a sync fails (auth, rate limit, etc.)."""

    def __init__(self, message: str, *, auth: bool = False) -> None:
        super().__init__(message)
        self.auth = auth


class GithubSync:
    def __init__(self, token: str, repo_full_name: str, branch: str = "main") -> None:
        self._gh = Github(token)
        self._repo_name = repo_full_name
        self.branch = branch
        try:
            self.repo = self._gh.get_repo(repo_full_name)
        except GithubException as exc:
            raise GithubSyncError(
                f"cannot access repo {repo_full_name}: {_msg(exc)}",
                auth=exc.status in (401, 403, 404),
            ) from exc

    # ---- public API -----------------------------------------------------

    def sync_problem(self, question: Question, submission: Submission) -> dict:
        """Write/refresh one problem and the index in a single commit.

        Returns ``{folder, commit_url, created}``.
        """
        folder = formatter.problem_folder(question)
        files = formatter.build_problem_files(question, submission)

        readme_path = f"{folder}/README.md"
        existing_readme = self._read_text(readme_path)
        created = existing_readme is None
        if existing_readme is not None:
            files["README.md"] = formatter.merge_notes(existing_readme, files["README.md"])

        # Update the manifest and regenerate the index.
        manifest = self._read_manifest()
        if submission.timestamp:
            solved_at = datetime.fromtimestamp(
                submission.timestamp, tz=timezone.utc
            ).date().isoformat()
        else:
            solved_at = None
        manifest[folder] = {
            "frontend_id": question.frontend_id,
            "title": question.title,
            "slug": question.slug,
            "difficulty": question.difficulty,
            "folder": folder,
            "lang_display": submission.lang_display,
            "solved_at": solved_at,
        }
        index_md = formatter.build_index(list(manifest.values()))

        tree_files = {f"{folder}/{name}": content for name, content in files.items()}
        tree_files["README.md"] = index_md
        tree_files[MANIFEST_PATH] = json.dumps(manifest, indent=2, sort_keys=True) + "\n"

        verb = "Add" if created else "Update"
        message = f"{verb} solution: {question.frontend_id}. {question.title} ({submission.lang_display})"
        commit_url = self._commit_files(tree_files, message)
        return {"folder": folder, "commit_url": commit_url, "created": created}

    def read_manifest(self) -> dict:
        """Public accessor for the solved-problems manifest (used by /stats)."""
        return self._read_manifest()

    # ---- internals ------------------------------------------------------

    def _read_text(self, path: str) -> str | None:
        try:
            content = self.repo.get_contents(path, ref=self.branch)
        except GithubException as exc:
            if exc.status == 404:
                return None
            raise GithubSyncError(f"failed reading {path}: {_msg(exc)}", auth=exc.status in (401, 403)) from exc
        if isinstance(content, list):
            return None
        return content.decoded_content.decode("utf-8")

    def _read_manifest(self) -> dict:
        raw = self._read_text(MANIFEST_PATH)
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def _commit_files(self, files: dict[str, str], message: str) -> str:
        """Commit several files at once. Falls back to per-file create on an empty repo."""
        try:
            ref = self.repo.get_git_ref(f"heads/{self.branch}")
        except GithubException as exc:
            if exc.status in (404, 409):  # empty repo, no commits yet
                return self._bootstrap_commit(files, message)
            raise GithubSyncError(f"failed reading branch {self.branch}: {_msg(exc)}", auth=exc.status in (401, 403)) from exc

        try:
            base_commit = self.repo.get_git_commit(ref.object.sha)
            elements = [
                InputGitTreeElement(
                    path=path,
                    mode="100644",
                    type="blob",
                    sha=self.repo.create_git_blob(content, "utf-8").sha,
                )
                for path, content in files.items()
            ]
            new_tree = self.repo.create_git_tree(elements, base_commit.tree)
            new_commit = self.repo.create_git_commit(message, new_tree, [base_commit])
            ref.edit(new_commit.sha)
            return new_commit.html_url
        except GithubException as exc:
            raise GithubSyncError(f"commit failed: {_msg(exc)}", auth=exc.status in (401, 403)) from exc

    def _bootstrap_commit(self, files: dict[str, str], message: str) -> str:
        """Create files one by one on an empty repo (creates the first commit)."""
        last_url = ""
        try:
            for path, content in files.items():
                result = self.repo.create_file(path, message, content, branch=self.branch)
                last_url = result["commit"].html_url
        except GithubException as exc:
            raise GithubSyncError(f"bootstrap commit failed: {_msg(exc)}", auth=exc.status in (401, 403)) from exc
        return last_url


def _msg(exc: GithubException) -> str:
    data = getattr(exc, "data", None) or {}
    return data.get("message", str(exc))
