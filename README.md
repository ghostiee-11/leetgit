# LeetGit

Auto-sync your accepted LeetCode solutions to a GitHub repo, with a polished
browser dashboard that tracks your streak, difficulty breakdown, and recent
solves.

Solve a problem on LeetCode, and LeetGit pushes the question, your accepted
code, and the runtime/memory stats to your GitHub repo automatically. No manual
copy-paste.

## How it works

The extension is **self-contained**: it runs entirely in your browser, no server
to install. On `leetcode.com` it has your login, so when a submission is
Accepted it fetches the problem and your code directly, then commits them to your
GitHub repo using the GitHub API.

```
Chrome/Edge extension (JS), runs in your browser
  detects "Accepted" on leetcode.com
  fetches the question + your code + stats   (LeetCode GraphQL, your session)
  formats a README + solution file
  commits to your repo                        (GitHub API, your account)
  shows the dashboard (streak, charts)
```

There is no LeetGit server. Your code goes only to the GitHub repo you pick.

> A separate **Python/CLI** path also exists for power users who prefer a local
> service. See "Alternative: Python service" near the end. The published Chrome
> Web Store build uses the self-contained extension above.

## What lands in your repo

```
your-repo/
  README.md                 auto-generated progress index (counts + table)
  1-two-sum/
    README.md               statement, difficulty, tags, link, stats, your Notes
    solution.py
  146-lru-cache/
    README.md
    solution.java
  .leetgit/solved.json      manifest used to build stats and the index
```

Your `## Notes` section in each problem README is preserved across re-syncs, so
you can write up your approach and it will never be overwritten.

## Install (the extension)

### From source (load unpacked)

1. Clone this repo.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. Click the LeetGit icon and follow onboarding:
   - **Connect GitHub** (sign in with GitHub, or paste a personal access token),
   - **Choose a repo** (pick an existing one or create a new one),
   - done.
5. Make sure you are logged in to leetcode.com in the same browser.

To enable the one-click "Sign in with GitHub" button you need a GitHub OAuth App
client id; see [extension/PUBLISHING.md](extension/PUBLISHING.md). The
token path works immediately without it.

### From the Chrome Web Store

Packaging and submission steps are in
[extension/PUBLISHING.md](extension/PUBLISHING.md). Build a zip with:

```bash
bash scripts/package-extension.sh   # -> dist/leetgit-extension-vX.Y.Z.zip
```

## Usage

Just solve problems. When a submission is accepted, LeetGit pushes it and a green
check appears on the toolbar icon. Open the popup to see:

- Current and longest **streak**, plus total active days
- A **donut chart** and bars of Easy / Medium / Hard solved
- A 30-day **activity** chart
- Your most **recent solves**, each linking to its folder in the repo

## Alternative: Python service (advanced)

A FastAPI service + CLI version lives in `src/leetgit/` for people who prefer to
run sync locally instead of in the extension. It is not required for the
extension above.

```bash
pip install -e .
leetgit init      # paste a PAT, enter the repo
leetgit serve
```

## CLI

| Command | What it does |
| --- | --- |
| `leetgit init` | Interactive setup (token, repo, port, region). |
| `leetgit serve` | Run the local sync service. |
| `leetgit show-config` | Print the current config with the token redacted. |

## Configuration

`~/.leetgit/config.yaml`:

| Key | Default | Notes |
| --- | --- | --- |
| `github_token` | (required) | Fine-grained PAT with Contents write. |
| `github_repo` | (required) | `owner/name` of your solutions repo. |
| `github_branch` | `main` | Branch to commit to. |
| `port` | `8765` | Local service port (match it in the extension). |
| `region` | `com` | `com` or `cn`. |
| `leetcode_session` | unset | Optional cookie fallback if the extension cannot supply it. |
| `leetcode_csrftoken` | unset | Optional cookie fallback. |

## Troubleshooting

- **Popup says "offline"**: the Python service is not running. Start it with
  `leetgit serve`, then click "Retry connection".
- **Banner says re-login to LeetCode**: your LeetCode session expired. Log in
  again in the browser and re-submit the problem.
- **GitHub error**: usually the token lacks Contents write on the repo, or the
  repo name is wrong. Check `leetgit show-config`.
- **Nothing syncs after Accepted**: confirm the extension is loaded and the
  popup status is green, and that you are on `https://leetcode.com`.

## Development

```bash
pip install -e ".[dev]"
pytest            # runs the unit + integration suite
```

Backend modules live in `src/leetgit/`:

- `config.py` config load/validate
- `leetcode.py` GraphQL client (question + submission)
- `formatter.py` pure formatting (markdown, files, notes merge, index)
- `github_sync.py` single-commit push via the GitHub API
- `stats.py` streak and difficulty computations
- `service.py` FastAPI app (`/sync`, `/stats`, `/health`)
- `cli.py` Typer CLI

The extension lives in `extension/`. Icons are generated by
`extension/icons/generate_icons.py` (no image libraries needed).

## Privacy

LeetGit runs entirely on your machine. Your GitHub token and LeetCode cookies
never leave your computer except in the direct calls to GitHub and LeetCode that
you would make yourself. The local service binds to `127.0.0.1` only.
