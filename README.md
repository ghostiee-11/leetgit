# LeetGit

Auto-sync your accepted LeetCode solutions to a GitHub repo, with a polished
browser dashboard that tracks your streak, difficulty breakdown, and recent
solves.

Solve a problem on LeetCode, and LeetGit pushes the question, your accepted
code, and the runtime/memory stats to your GitHub repo automatically. No manual
copy-paste.

## How it works

LeetCode has no official public API, and a browser extension can only run
JavaScript, so LeetGit is split into two pieces:

```
Chrome/Edge extension (JS)            Local Python service (FastAPI)         GitHub
  detects "Accepted"      POST /sync     fetches question + your code      one commit
  reads LeetCode cookies  ----------->   formats README + solution file   ----------->
  shows the dashboard     <-----------   commits + pushes via the API
```

- The **extension** detects an accepted submission, reads your LeetCode session
  cookies, and forwards the event to the local service. It also renders the
  dashboard (streak, charts, recent solves).
- The **Python service** does all the real work: fetch the problem and your
  submission from LeetCode's GraphQL API, format the files, and push them to
  your repo. Secrets stay on your machine.

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

## Setup

### 1. Install the Python service

Requires Python 3.11+.

```bash
git clone https://github.com/ghostiee-11/leetgit.git
cd leetgit
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

### 2. Create a GitHub repo and token

- Create (or pick) a repo to hold your solutions, for example
  `your-name/leetcode-solutions`.
- Create a fine-grained Personal Access Token with read/write access to
  **Contents** on that repo: https://github.com/settings/tokens?type=beta

### 3. Configure and run

```bash
leetgit init      # paste the token, enter the repo, choose a port
leetgit serve     # starts the local service on 127.0.0.1:8765
```

`leetgit init` writes `~/.leetgit/config.yaml` (chmod 600). The token never
leaves your machine and is not committed anywhere.

### 4. Load the extension

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. Make sure you are logged in to LeetCode in the same browser.

Open the extension popup to confirm the status dot is green ("connected"). If
the port is not the default 8765, set it from the popup settings gear.

## Usage

Just solve problems. When a submission is accepted, LeetGit pushes it and the
toolbar badge shows a green check. Open the popup to see:

- Current and longest **streak**, plus total active days
- A **donut chart** and bars of Easy / Medium / Hard solved
- A 30-day **activity** chart
- Your most **recent solves**, each linking to its folder in the repo

If the local service is not running, accepted submissions are queued in the
extension and retried automatically once it comes back.

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
