# LeetGit Privacy Policy

_Last updated: 2026-06-01_

LeetGit is a browser extension that saves your accepted LeetCode solutions to a
GitHub repository you choose. Your privacy is simple to explain because the
extension has no servers of its own.

## What the extension accesses

- **Your LeetCode submission data.** When you get an "Accepted" result, the
  extension reads the problem statement, your submitted code, and the
  runtime/memory stats for that submission, using your existing LeetCode login
  in the browser.
- **Your GitHub account, scoped to repositories.** After you sign in with
  GitHub (or provide a personal access token), the extension creates and updates
  files in the single repository you select.

## Where your data goes

- Your solutions are sent **only** to GitHub, into the repository you chose, as
  commits made on your behalf.
- LeetCode problem data is fetched **directly from leetcode.com** by the
  extension running in your browser.
- Nothing is sent to the LeetGit authors or any third-party server. There is no
  LeetGit backend.

## What is stored, and where

- Your GitHub access token, selected repository, and a local cache of your
  solved-problem list are stored in the browser's local extension storage
  (`chrome.storage.local`) on your device only.
- The token is used solely to authenticate GitHub API requests that push your
  solutions.

## What we do NOT do

- We do not collect analytics, telemetry, or usage data.
- We do not sell or share any data.
- We do not transmit your token or solutions anywhere except GitHub.

## Removing your data

- Click **Disconnect GitHub** in the extension settings to delete the stored
  token and cached data from your device.
- Uninstalling the extension removes all local extension storage.
- Files already pushed to your GitHub repository are yours; manage or delete
  them in GitHub.

## Permissions and why

- `storage`: save your token, selected repo, and solve cache locally.
- Host access to `leetcode.com`: detect accepted submissions and read the
  problem + your code.
- Host access to `api.github.com` and `github.com`: sign in and push commits.

## Contact

Questions: open an issue at https://github.com/ghostiee-11/leetgit
