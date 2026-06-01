"""Unit tests for GithubSync using a fake PyGithub repo (no network)."""

from leetgit.github_sync import MANIFEST_PATH, GithubSync
from leetgit.leetcode import Question, Submission


class FakeContent:
    def __init__(self, text: str):
        self.decoded_content = text.encode("utf-8")


class FakeBlob:
    def __init__(self, sha):
        self.sha = sha


class FakeTree:
    def __init__(self, sha="tree0"):
        self.sha = sha


class FakeCommit:
    def __init__(self, sha="commit1"):
        self.sha = sha
        self.tree = FakeTree()
        self.html_url = f"https://github.com/me/solutions/commit/{sha}"


class FakeRef:
    def __init__(self):
        self.object = type("O", (), {"sha": "base"})()
        self.edited_to = None

    def edit(self, sha):
        self.edited_to = sha


class FakeRepo:
    """Implements just the methods GithubSync touches, recording the commit tree."""

    def __init__(self, files=None):
        self.files = files or {}  # path -> text
        self.committed_tree = None
        self.commit_message = None
        self._blob_n = 0

    def get_contents(self, path, ref=None):
        from github import GithubException

        if path in self.files:
            return FakeContent(self.files[path])
        raise GithubException(404, {"message": "Not Found"}, None)

    def get_git_ref(self, _ref):
        return FakeRef()

    def get_git_commit(self, _sha):
        return FakeCommit("base")

    def create_git_blob(self, content, _encoding):
        self._blob_n += 1
        # Stash content keyed by sha so the test can inspect it.
        sha = f"blob{self._blob_n}"
        self.files.setdefault("__blobs__", {})[sha] = content
        return FakeBlob(sha)

    def create_git_tree(self, elements, _base):
        self.committed_tree = {e._identity["path"]: e._identity["sha"] for e in elements}
        return FakeTree("newtree")

    def create_git_commit(self, message, _tree, _parents):
        self.commit_message = message
        return FakeCommit("newcommit")


def _syncer(repo: FakeRepo) -> GithubSync:
    obj = object.__new__(GithubSync)
    obj.repo = repo
    obj.branch = "main"
    return obj


def _question():
    return Question(
        frontend_id="1", title="Two Sum", slug="two-sum", difficulty="Easy",
        content_html="<p>x</p>", tags=["Array"],
    )


def _submission():
    return Submission(
        code="print(1)", lang="python3", lang_display="Python3", runtime="40 ms",
        runtime_percentile=90.0, memory="16 MB", memory_percentile=50.0,
        timestamp=1764547200,
    )


def test_sync_creates_folder_index_and_manifest():
    repo = FakeRepo()
    result = _syncer(repo).sync_problem(_question(), _submission())

    assert result["created"] is True
    paths = set(repo.committed_tree)
    assert "1-two-sum/README.md" in paths
    assert "1-two-sum/solution.py" in paths
    assert "README.md" in paths  # top-level index
    assert MANIFEST_PATH in paths
    assert "Add solution: 1. Two Sum (Python3)" == repo.commit_message


def test_sync_preserves_existing_notes():
    existing_readme = (
        "# 1. Two Sum\n\n## Solution\n\nold\n\n## Notes\n\nMy two-pointer trick.\n"
    )
    repo = FakeRepo(files={"1-two-sum/README.md": existing_readme})
    syncer = _syncer(repo)
    result = syncer.sync_problem(_question(), _submission())

    assert result["created"] is False
    # Find the README blob content that was committed.
    readme_sha = repo.committed_tree["1-two-sum/README.md"]
    readme_text = repo.files["__blobs__"][readme_sha]
    assert "My two-pointer trick." in readme_text
