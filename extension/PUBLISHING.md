# Publishing LeetGit to the Chrome Web Store

This is the self-contained extension (no Python needed). End users just install
it, click "Sign in with GitHub", pick a repo, and their solves start syncing.

## Onboarding flow (what users see)

1. Install the extension, click the LeetGit icon.
2. **Step 1 - Connect GitHub:** "Sign in with GitHub" (device flow), or paste a
   personal access token.
3. **Step 2 - Choose a repo:** pick an existing repo or create a new one.
4. **Step 3 - Dashboard:** done. Solving a problem now pushes to the repo and the
   dashboard fills in.

## One-time setup before publishing

### 1. Create a GitHub OAuth App (for "Sign in with GitHub")

The device flow needs a public OAuth client id (no client secret is shipped, so
it is safe to embed).

1. Go to https://github.com/settings/developers -> **OAuth Apps** -> **New OAuth App**.
2. Fill in:
   - Application name: `LeetGit`
   - Homepage URL: `https://github.com/ghostiee-11/leetgit`
   - Authorization callback URL: `https://github.com/ghostiee-11/leetgit`
     (device flow does not use it, but the field is required)
3. Create the app, then on its page **check "Enable Device Flow"** and save.
4. Copy the **Client ID**.
5. Paste it into `extension/lib/github.js`, replacing `REPLACE_WITH_OAUTH_CLIENT_ID`:
   ```js
   const CLIENT_ID = "Iv1.xxxxxxxxxxxx";
   ```

Until you set this, the "Sign in with GitHub" button tells users to use a token
instead (the PAT path works without any OAuth app).

### 2. Generate icons (already committed)

```bash
python3 extension/icons/generate_icons.py
```

### 3. Package the extension

```bash
bash scripts/package-extension.sh
# -> dist/leetgit-extension-v<version>.zip
```

The zip excludes the Python icon scripts and docs, shipping only runtime files.

## Submitting to the Chrome Web Store

1. **Register** as a Chrome Web Store developer (one-time $5 USD fee):
   https://chrome.google.com/webstore/devconsole
2. Click **Add new item** and upload the zip from `dist/`.
3. Fill the **Store listing** using `extension/STORE_LISTING.md` (name, summary,
   description, category: Developer Tools).
4. Upload assets:
   - Store icon 128x128: `extension/icons/icon128.png`
   - At least one screenshot (1280x800 or 640x400). Open the popup and capture
     the dashboard and the connect screen.
5. **Privacy practices** tab:
   - Single purpose: see `STORE_LISTING.md`.
   - Justify each permission (text provided in `STORE_LISTING.md`).
   - Privacy policy URL: link to `extension/PRIVACY.md` (raw GitHub URL or your
     own hosted copy).
   - Declare data usage: the extension does not collect or transmit data to the
     developer (data goes only to the user's GitHub).
6. Submit for review. Review typically takes a few business days.

## Notes for reviewers / common rejections

- **No remote code.** All logic is bundled; the extension only calls the GitHub
  and LeetCode APIs. Keep it that way (do not add CDN scripts) to pass review.
- **Host permissions are justified** by the single purpose: read LeetCode
  submissions, write to GitHub.
- **Versioning:** bump `version` in `manifest.json` for each update before
  repackaging.

## Local testing before submitting

1. `chrome://extensions` -> Developer mode -> **Load unpacked** -> select
   `extension/`.
2. Open the popup, connect (token path works immediately), pick a repo.
3. Solve an easy problem on leetcode.com and confirm the commit appears and the
   dashboard updates.
