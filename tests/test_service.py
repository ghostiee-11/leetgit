from fastapi.testclient import TestClient

from leetgit.config import Config
from leetgit.leetcode import LeetCodeError, Question, Submission
from leetgit.service import SyncService, create_app


class FakeLeetCode:
    def __init__(self):
        self.calls = []

    async def get_question(self, slug):
        self.calls.append(("question", slug))
        return Question(
            frontend_id="1", title="Two Sum", slug=slug, difficulty="Easy",
            content_html="<p>x</p>", tags=["Array"],
        )

    async def get_submission(self, submission_id, cookies):
        self.calls.append(("submission", submission_id, cookies))
        if not cookies.get("LEETCODE_SESSION"):
            raise LeetCodeError("no session", auth=True)
        return Submission(
            code="print(1)", lang="python3", lang_display="Python3",
            runtime="40 ms", runtime_percentile=90.0, memory="16 MB",
            memory_percentile=50.0, timestamp=1764547200,
        )


class FakeSyncer:
    def __init__(self):
        self.synced = []
        self._manifest = {}

    def sync_problem(self, question, submission):
        folder = f"{question.frontend_id}-{question.slug}"
        self.synced.append(folder)
        self._manifest[folder] = {
            "frontend_id": question.frontend_id, "title": question.title,
            "slug": question.slug, "difficulty": question.difficulty,
            "folder": folder, "lang_display": submission.lang_display,
            "solved_at": "2026-12-01",
        }
        return {"folder": folder, "commit_url": "https://github.com/x/y/commit/abc", "created": True}

    def read_manifest(self):
        return self._manifest


def _client():
    config = Config(github_token="t", github_repo="me/solutions")
    leet = FakeLeetCode()
    syncer = FakeSyncer()
    service = SyncService(leet, syncer, config)
    app = create_app(config, service=service)
    return TestClient(app), leet, syncer


def test_health_ok():
    client, _, _ = _client()
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["repo"] == "me/solutions"


def test_sync_success_and_dedupe():
    client, leet, syncer = _client()
    payload = {"slug": "two-sum", "submissionId": 999, "cookies": {"LEETCODE_SESSION": "abc", "csrftoken": "c"}}

    resp = client.post("/sync", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["commitUrl"].endswith("/abc")
    assert syncer.synced == ["1-two-sum"]

    # Same submission again is deduped, no second sync.
    resp2 = client.post("/sync", json=payload)
    assert resp2.json().get("skipped") is True
    assert syncer.synced == ["1-two-sum"]


def test_sync_auth_error_returns_401_with_reauth():
    client, _, _ = _client()
    resp = client.post("/sync", json={"slug": "two-sum", "submissionId": 5, "cookies": {}})
    assert resp.status_code == 401
    assert resp.json()["reauth"] is True


def test_stats_endpoint_after_sync():
    client, _, _ = _client()
    client.post("/sync", json={"slug": "two-sum", "submissionId": 1, "cookies": {"LEETCODE_SESSION": "abc"}})
    resp = client.get("/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["total"] == 1
    assert data["byDifficulty"]["Easy"] == 1
