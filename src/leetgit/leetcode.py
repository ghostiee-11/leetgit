"""Client for LeetCode's unofficial GraphQL API.

Question content is public; submission details require the caller's session
cookies (``LEETCODE_SESSION`` + ``csrftoken``), supplied per request by the
browser extension (or from config as a fallback).
"""

from __future__ import annotations

import httpx
from pydantic import BaseModel

_QUESTION_QUERY = """
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    titleSlug
    difficulty
    content
    topicTags { name slug }
  }
}
"""

_SUBMISSION_QUERY = """
query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    code
    runtimeDisplay
    runtimePercentile
    memoryDisplay
    memoryPercentile
    timestamp
    lang { name verboseName }
  }
}
"""


class Question(BaseModel):
    frontend_id: str
    title: str
    slug: str
    difficulty: str
    content_html: str
    tags: list[str]

    @property
    def url(self) -> str:
        return f"https://leetcode.com/problems/{self.slug}/"


class Submission(BaseModel):
    code: str
    lang: str  # internal name, e.g. "python3", used for the file extension
    lang_display: str  # human label, e.g. "Python3"
    runtime: str
    runtime_percentile: float | None
    memory: str
    memory_percentile: float | None
    timestamp: int  # unix seconds


class LeetCodeError(RuntimeError):
    """Raised on API failures. ``auth`` marks an expired/invalid session."""

    def __init__(self, message: str, *, auth: bool = False) -> None:
        super().__init__(message)
        self.auth = auth


class LeetCodeClient:
    """Thin async wrapper over the LeetCode GraphQL endpoint."""

    def __init__(self, base_url: str = "https://leetcode.com", *, client: httpx.AsyncClient | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self._client = client or httpx.AsyncClient(timeout=20.0)
        self._owns_client = client is None

    async def __aenter__(self) -> "LeetCodeClient":
        return self

    async def __aexit__(self, *exc) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _graphql(self, query: str, variables: dict, *, cookies: dict | None = None) -> dict:
        headers = {
            "content-type": "application/json",
            "referer": f"{self.base_url}/",
            "origin": self.base_url,
        }
        if cookies and cookies.get("csrftoken"):
            headers["x-csrftoken"] = cookies["csrftoken"]
        try:
            resp = await self._client.post(
                f"{self.base_url}/graphql",
                json={"query": query, "variables": variables},
                headers=headers,
                cookies=cookies or {},
            )
        except httpx.HTTPError as exc:  # network-level
            raise LeetCodeError(f"network error talking to LeetCode: {exc}") from exc

        if resp.status_code in (401, 403):
            raise LeetCodeError("LeetCode session invalid or expired", auth=True)
        if resp.status_code >= 400:
            raise LeetCodeError(f"LeetCode returned HTTP {resp.status_code}")

        payload = resp.json()
        if payload.get("errors"):
            raise LeetCodeError(f"GraphQL error: {payload['errors']}")
        return payload.get("data") or {}

    async def get_question(self, slug: str) -> Question:
        data = await self._graphql(_QUESTION_QUERY, {"titleSlug": slug})
        q = data.get("question")
        if not q:
            raise LeetCodeError(f"unknown problem slug: {slug}")
        return Question(
            frontend_id=q["questionFrontendId"],
            title=q["title"],
            slug=q["titleSlug"],
            difficulty=q["difficulty"],
            content_html=q.get("content") or "",
            tags=[t["name"] for t in (q.get("topicTags") or [])],
        )

    async def get_submission(self, submission_id: int, cookies: dict) -> Submission:
        data = await self._graphql(
            _SUBMISSION_QUERY, {"submissionId": int(submission_id)}, cookies=cookies
        )
        d = data.get("submissionDetails")
        if not d:
            raise LeetCodeError(
                f"no details for submission {submission_id} (not yours, or session expired)",
                auth=True,
            )
        lang = d.get("lang") or {}
        return Submission(
            code=d.get("code") or "",
            lang=lang.get("name", "text"),
            lang_display=lang.get("verboseName") or lang.get("name", "text"),
            runtime=d.get("runtimeDisplay") or "N/A",
            runtime_percentile=d.get("runtimePercentile"),
            memory=d.get("memoryDisplay") or "N/A",
            memory_percentile=d.get("memoryPercentile"),
            timestamp=int(d.get("timestamp") or 0),
        )
