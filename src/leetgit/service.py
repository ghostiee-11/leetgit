"""Local FastAPI service the browser extension talks to.

Binds to 127.0.0.1 only. Exposes ``POST /sync`` (the main flow) and
``GET /health`` (for the popup status dot).
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import date

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import stats as stats_mod
from .config import Config
from .github_sync import GithubSync, GithubSyncError
from .leetcode import LeetCodeClient, LeetCodeError

log = logging.getLogger("leetgit")

_STATS_TTL_SECONDS = 20.0


class SyncRequest(BaseModel):
    slug: str
    submissionId: int
    cookies: dict[str, str] = Field(default_factory=dict)


class SyncService:
    """Orchestrates one sync: fetch question + submission, then push to GitHub."""

    def __init__(self, leetcode: LeetCodeClient, syncer: GithubSync, config: Config) -> None:
        self.leetcode = leetcode
        self.syncer = syncer
        self.config = config
        self._seen: set[str] = set()
        self.last_result: dict | None = None
        self._stats_cache: dict | None = None
        self._stats_cached_at: float = 0.0

    def _resolve_cookies(self, cookies: dict[str, str]) -> dict[str, str]:
        """Use extension-supplied cookies, falling back to config values."""
        resolved = dict(cookies or {})
        if not resolved.get("LEETCODE_SESSION") and self.config.leetcode_session:
            resolved["LEETCODE_SESSION"] = self.config.leetcode_session
        if not resolved.get("csrftoken") and self.config.leetcode_csrftoken:
            resolved["csrftoken"] = self.config.leetcode_csrftoken
        return resolved

    async def sync(self, req: SyncRequest) -> dict:
        key = str(req.submissionId)
        if key in self._seen:
            return {"ok": True, "skipped": True, "reason": "already synced this session"}

        cookies = self._resolve_cookies(req.cookies)
        question = await self.leetcode.get_question(req.slug)
        submission = await self.leetcode.get_submission(req.submissionId, cookies)
        result = await asyncio.to_thread(self.syncer.sync_problem, question, submission)

        self._seen.add(key)
        self.last_result = {
            "ok": True,
            "title": f"{question.frontend_id}. {question.title}",
            "commitUrl": result["commit_url"],
            "created": result["created"],
        }
        self._stats_cache = None  # invalidate so the dashboard reflects the new solve
        return self.last_result

    async def get_stats(self, *, force: bool = False) -> dict:
        now = time.monotonic()
        if (
            not force
            and self._stats_cache is not None
            and now - self._stats_cached_at < _STATS_TTL_SECONDS
        ):
            return self._stats_cache
        manifest = await asyncio.to_thread(self.syncer.read_manifest)
        result = stats_mod.compute_stats(list(manifest.values()), date.today())
        self._stats_cache = result
        self._stats_cached_at = now
        return result


def create_app(config: Config, *, service: SyncService | None = None) -> FastAPI:
    """Build the FastAPI app. Pass ``service`` to inject a fake in tests."""
    app = FastAPI(title="LeetGit", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # localhost-only service; extension origin varies
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if service is None:
        client = LeetCodeClient(base_url=config.leetcode_base)
        syncer = GithubSync(config.github_token, config.github_repo, config.github_branch)
        service = SyncService(client, syncer, config)

    app.state.service = service

    @app.get("/health")
    async def health() -> dict:
        svc: SyncService = app.state.service
        return {
            "ok": True,
            "repo": config.github_repo,
            "branch": config.github_branch,
            "last": svc.last_result,
        }

    @app.get("/stats")
    async def stats() -> JSONResponse:
        svc: SyncService = app.state.service
        try:
            data = await svc.get_stats()
            return JSONResponse({"ok": True, "repo": config.github_repo, **data})
        except GithubSyncError as exc:
            log.warning("stats github error: %s", exc)
            return JSONResponse(
                {"ok": False, "error": str(exc), "githubAuth": exc.auth},
                status_code=401 if exc.auth else 502,
            )

    @app.post("/sync")
    async def sync(req: SyncRequest) -> JSONResponse:
        svc: SyncService = app.state.service
        try:
            result = await svc.sync(req)
            return JSONResponse(result)
        except LeetCodeError as exc:
            log.warning("leetcode error: %s", exc)
            return JSONResponse(
                {"ok": False, "error": str(exc), "reauth": exc.auth},
                status_code=401 if exc.auth else 502,
            )
        except GithubSyncError as exc:
            log.warning("github error: %s", exc)
            return JSONResponse(
                {"ok": False, "error": str(exc), "githubAuth": exc.auth},
                status_code=401 if exc.auth else 502,
            )
        except Exception as exc:  # noqa: BLE001 last-resort guard for the local service
            log.exception("unexpected sync failure")
            return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)

    return app
