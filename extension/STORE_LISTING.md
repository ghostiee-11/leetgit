# Chrome Web Store listing copy

Paste these into the Web Store developer dashboard.

## Name
LeetGit: LeetCode to GitHub

## Summary (132 chars max)
Auto-push your accepted LeetCode solutions to GitHub, with streaks, a difficulty
breakdown, and a solve dashboard.

## Category
Developer Tools

## Description
LeetGit saves every LeetCode problem you solve straight to your own GitHub repo,
automatically.

Solve a problem, hit Submit, and once it is Accepted LeetGit commits the question,
your code, and your runtime/memory stats to GitHub. No copy-paste, no setup per
problem.

FEATURES
- One-click "Sign in with GitHub", then pick or create a repo. That is the whole
  setup.
- Automatic push on every accepted submission: a clean folder per problem with a
  README (statement, tags, link, stats) and your solution file.
- A built-in dashboard: current and longest streak, Easy/Medium/Hard breakdown
  donut, a 30-day activity chart, and your recent solves.
- An auto-generated progress index in your repo.
- Your notes are preserved: write up your approach in a problem's README and it
  is never overwritten on re-sync.

PRIVACY
LeetGit has no server. Your code goes only to the GitHub repo you choose, fetched
directly in your browser. Your token and data stay on your device. See the
privacy policy.

Works on leetcode.com. Free and open source.

## Single purpose (for the dashboard's justification field)
LeetGit detects accepted LeetCode submissions and saves the problem and your
solution to a GitHub repository you select.

## Permission justifications
- storage: store the user's GitHub token, selected repository, and local solve
  cache for the dashboard.
- leetcode.com host access: detect accepted submissions and read the problem
  statement and the user's submitted code/stats.
- api.github.com / github.com host access: authenticate the user (GitHub OAuth
  device flow) and commit solutions to their chosen repository.

## Privacy policy URL
https://github.com/ghostiee-11/leetgit/blob/main/extension/PRIVACY.md

## Assets to upload
- Store icon: 128x128 (extension/icons/icon128.png)
- Screenshots: at least one 1280x800 or 640x400 PNG of the dashboard/onboarding
- Optional small promo tile: 440x280
