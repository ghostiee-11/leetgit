"""Configuration loading and validation for LeetGit.

Config lives in ``~/.leetgit/config.yaml`` (overridable via ``LEETGIT_CONFIG``).
It holds the GitHub PAT, target repo and a few service settings. Secrets stay
local and are never written into the project repo.
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml
from pydantic import BaseModel, Field, field_validator


def default_config_path() -> Path:
    """Return the config file path, honoring the ``LEETGIT_CONFIG`` override."""
    override = os.environ.get("LEETGIT_CONFIG")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".leetgit" / "config.yaml"


class Config(BaseModel):
    """Validated LeetGit settings."""

    github_token: str = Field(..., description="Fine-grained GitHub PAT.")
    github_repo: str = Field(..., description="Target repo as 'owner/name'.")
    github_branch: str = Field(default="main")
    port: int = Field(default=8765, ge=1, le=65535)
    region: str = Field(default="com", description="LeetCode region: 'com' or 'cn'.")
    # Optional fallback when the extension can't supply cookies per-request.
    leetcode_session: str | None = None
    leetcode_csrftoken: str | None = None

    @field_validator("github_repo")
    @classmethod
    def _validate_repo(cls, value: str) -> str:
        if value.count("/") != 1 or value.startswith("/") or value.endswith("/"):
            raise ValueError("github_repo must be in 'owner/name' form")
        return value

    @field_validator("region")
    @classmethod
    def _validate_region(cls, value: str) -> str:
        value = value.lower()
        if value not in {"com", "cn"}:
            raise ValueError("region must be 'com' or 'cn'")
        return value

    @property
    def leetcode_base(self) -> str:
        return f"https://leetcode.{self.region}"


def load_config(path: Path | None = None) -> Config:
    """Load and validate config from disk.

    Raises ``FileNotFoundError`` if the file is missing (run ``leetgit init``),
    and ``pydantic.ValidationError`` for malformed content.
    """
    path = path or default_config_path()
    if not path.exists():
        raise FileNotFoundError(
            f"No config at {path}. Run 'leetgit init' to create one."
        )
    data = yaml.safe_load(path.read_text()) or {}
    return Config(**data)


def save_config(config: Config, path: Path | None = None) -> Path:
    """Write config to disk with owner-only permissions (it holds a token)."""
    path = path or default_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(config.model_dump(), sort_keys=True))
    os.chmod(path, 0o600)
    return path
