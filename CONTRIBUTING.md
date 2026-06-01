# Contributing to LeetGit

Thanks for your interest in improving LeetGit. Contributions of all kinds are
welcome: bug reports, fixes, features, docs, and design.

## Ground rules

- All changes land through a **pull request**. The `main` branch is protected,
  so there are no direct pushes or direct merges to `main`.
- Open an issue first for anything large, so we can agree on the approach before
  you spend time on it.
- Keep pull requests focused. One topic per PR is easier to review.

## Ways to contribute

- Report a bug or request a feature using the issue templates.
- Improve the extension UI or the dashboard.
- Improve detection, formatting, or GitHub sync.
- Improve docs.

## Development setup

### Extension (Chrome / Edge)

1. Clone your fork.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. After editing files, reload the extension and hard-refresh the LeetCode tab.

Syntax-check the JavaScript before committing:

```bash
cd extension
for f in background.js content.js inject.js popup.js lib/*.js; do node --check "$f"; done
node -e "JSON.parse(require('fs').readFileSync('manifest.json'))"
```

### Python service (optional path)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

## Pull request workflow

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b my-change
   ```
2. Make your change. Keep commits small and descriptive.
3. Run the checks above (Python tests pass, JavaScript passes `node --check`).
4. Push your branch to your fork and open a pull request against `main`.
5. Fill in the pull request template and link any related issue.
6. A maintainer reviews and merges. Direct merges to `main` are disabled, so
   every change goes through a PR.

## Style

- Do not use em dashes in code, comments, commit messages, or docs. Use commas,
  parentheses, or rewrite the sentence.
- Match the style of the surrounding code.
- Keep the extension dependency-free. Do not add remote scripts or CDN includes,
  the Chrome Web Store review forbids remote code.
- Prefer small, focused files with one clear purpose.

## Commit messages

- Write a short imperative summary, for example "Add Firefox manifest" or
  "Fix streak calculation across month boundaries".
- Reference an issue when relevant, for example "Fix #12: ...".

## Reporting security issues

If you find a security problem (for example a way the token could leak), please
open an issue marked clearly, or contact the maintainer privately rather than
posting exploit details publicly.
