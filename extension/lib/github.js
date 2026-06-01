// GitHub access for the service worker (loaded via importScripts). Handles the
// OAuth device flow, repo listing/creation, and a single-commit push of a
// solved problem. Exposes globalThis.LeetGitGH.
(function () {
  "use strict";

  // Public OAuth App client id (safe to ship). Create an OAuth App with
  // "Device Flow" enabled and paste its Client ID here. See PUBLISHING.md.
  const CLIENT_ID = "REPLACE_WITH_OAUTH_CLIENT_ID";
  const SCOPE = "repo";

  const NOTES_HEADING = "## Notes";
  const DEFAULT_NOTES = "_Add your notes here._";

  function b64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function isConfigured() {
    return CLIENT_ID && CLIENT_ID !== "REPLACE_WITH_OAUTH_CLIENT_ID";
  }

  // ---- Device flow ----
  async function startDeviceFlow() {
    if (!isConfigured()) {
      const e = new Error("OAuth client id not configured");
      e.code = "no_client_id";
      throw e;
    }
    const resp = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE }),
    });
    if (!resp.ok) throw new Error("device code request failed: HTTP " + resp.status);
    return resp.json(); // {device_code, user_code, verification_uri, expires_in, interval}
  }

  async function pollAccessToken(deviceCode, intervalSec, expiresInSec) {
    const start = Date.now();
    let interval = (intervalSec || 5) * 1000;
    while (Date.now() - start < (expiresInSec || 900) * 1000) {
      await new Promise((r) => setTimeout(r, interval));
      const resp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });
      const data = await resp.json();
      if (data.access_token) return data.access_token;
      if (data.error === "authorization_pending") continue;
      if (data.error === "slow_down") {
        interval += 5000;
        continue;
      }
      throw new Error(data.error_description || data.error || "authorization failed");
    }
    throw new Error("authorization timed out");
  }

  // ---- REST helpers ----
  async function api(token, path, opts) {
    const resp = await fetch("https://api.github.com" + path, {
      ...opts,
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts && opts.headers),
      },
    });
    return resp;
  }

  async function getUser(token) {
    const resp = await api(token, "/user");
    if (!resp.ok) throw authError(resp);
    return resp.json();
  }

  async function listRepos(token) {
    const out = [];
    for (let page = 1; page <= 3; page++) {
      const resp = await api(token, "/user/repos?per_page=100&sort=updated&affiliation=owner&page=" + page);
      if (!resp.ok) throw authError(resp);
      const batch = await resp.json();
      out.push(...batch.map((r) => ({ full_name: r.full_name, private: r.private, default_branch: r.default_branch })));
      if (batch.length < 100) break;
    }
    return out;
  }

  async function createRepo(token, name, isPrivate) {
    const resp = await api(token, "/user/repos", {
      method: "POST",
      body: JSON.stringify({ name: name, private: !!isPrivate, auto_init: true, description: "My LeetCode solutions, synced by LeetGit" }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.message || "could not create repo");
    }
    const r = await resp.json();
    return { full_name: r.full_name, default_branch: r.default_branch };
  }

  async function readFileText(token, full, path, branch) {
    const resp = await api(token, "/repos/" + full + "/contents/" + encodeURIComponent(path).replace(/%2F/g, "/") + "?ref=" + branch);
    if (resp.status === 404) return null;
    if (!resp.ok) throw authError(resp);
    const data = await resp.json();
    if (Array.isArray(data) || !data.content) return null;
    return decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
  }

  async function readManifest(token, full, branch) {
    const text = await readFileText(token, full, ".leetgit/solved.json", branch);
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (e) {
      return {};
    }
  }

  // ---- Pure helpers ----
  function extractNotes(readme) {
    const idx = readme.indexOf(NOTES_HEADING);
    if (idx === -1) return null;
    return readme.slice(idx + NOTES_HEADING.length).replace(/^\n+/, "").trim();
  }

  function mergeNotes(existingReadme, newReadme) {
    const old = extractNotes(existingReadme);
    if (old === null || old === "" || old === DEFAULT_NOTES) return newReadme;
    const idx = newReadme.indexOf(NOTES_HEADING);
    if (idx === -1) return newReadme.trimEnd() + "\n\n" + NOTES_HEADING + "\n\n" + old + "\n";
    return newReadme.slice(0, idx) + NOTES_HEADING + "\n\n" + old + "\n";
  }

  function buildIndex(rows) {
    const sorted = rows.slice().sort((a, b) => {
      const ai = parseInt(a.frontend_id, 10);
      const bi = parseInt(b.frontend_id, 10);
      if (!isNaN(ai) && !isNaN(bi)) return ai - bi;
      return String(a.frontend_id).localeCompare(String(b.frontend_id));
    });
    const counts = { Easy: 0, Medium: 0, Hard: 0 };
    for (const r of sorted) if (counts[r.difficulty] !== undefined) counts[r.difficulty]++;
    const lines = [
      "# LeetCode Solutions",
      "",
      "Auto-synced by [LeetGit](https://github.com/ghostiee-11/leetgit).",
      "",
      "**Solved: " + sorted.length + "** (Easy: " + counts.Easy + ", Medium: " + counts.Medium + ", Hard: " + counts.Hard + ")",
      "",
      "| # | Title | Difficulty | Language |",
      "| --- | --- | --- | --- |",
    ];
    for (const r of sorted) {
      lines.push("| " + r.frontend_id + " | [" + r.title + "](" + r.folder + "/) | " + r.difficulty + " | " + (r.lang_display || "") + " |");
    }
    return lines.join("\n") + "\n";
  }

  // ---- Single-commit push ----
  async function commitFiles(token, full, branch, files, message) {
    const refResp = await api(token, "/repos/" + full + "/git/ref/heads/" + branch);
    if (refResp.status === 404 || refResp.status === 409) {
      return bootstrapCommit(token, full, branch, files, message);
    }
    if (!refResp.ok) throw authError(refResp);
    const ref = await refResp.json();
    const baseSha = ref.object.sha;

    const commitResp = await api(token, "/repos/" + full + "/git/commits/" + baseSha);
    if (!commitResp.ok) throw authError(commitResp);
    const baseTree = (await commitResp.json()).tree.sha;

    const tree = [];
    for (const [path, content] of Object.entries(files)) {
      const blobResp = await api(token, "/repos/" + full + "/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: b64(content), encoding: "base64" }),
      });
      if (!blobResp.ok) throw authError(blobResp);
      tree.push({ path, mode: "100644", type: "blob", sha: (await blobResp.json()).sha });
    }

    const treeResp = await api(token, "/repos/" + full + "/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTree, tree }),
    });
    if (!treeResp.ok) throw authError(treeResp);
    const newTree = (await treeResp.json()).sha;

    const newCommitResp = await api(token, "/repos/" + full + "/git/commits", {
      method: "POST",
      body: JSON.stringify({ message, tree: newTree, parents: [baseSha] }),
    });
    if (!newCommitResp.ok) throw authError(newCommitResp);
    const newCommit = await newCommitResp.json();

    const patchResp = await api(token, "/repos/" + full + "/git/refs/heads/" + branch, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit.sha }),
    });
    if (!patchResp.ok) throw authError(patchResp);
    return newCommit.html_url;
  }

  async function bootstrapCommit(token, full, branch, files, message) {
    let lastUrl = "";
    for (const [path, content] of Object.entries(files)) {
      const resp = await api(token, "/repos/" + full + "/contents/" + path, {
        method: "PUT",
        body: JSON.stringify({ message, content: b64(content), branch }),
      });
      if (!resp.ok) throw authError(resp);
      lastUrl = (await resp.json()).commit.html_url;
    }
    return lastUrl;
  }

  async function pushSolution(token, full, branch, sol, manifest) {
    const existing = await readFileText(token, full, sol.folder + "/README.md", branch);
    let readme = sol.readme;
    if (existing) readme = mergeNotes(existing, readme);

    manifest[sol.folder] = sol.meta;
    const files = {};
    files[sol.folder + "/README.md"] = readme;
    files[sol.folder + "/" + sol.solutionName] = sol.solutionCode;
    files["README.md"] = buildIndex(Object.values(manifest));
    files[".leetgit/solved.json"] = JSON.stringify(manifest, null, 2) + "\n";

    const verb = existing ? "Update" : "Add";
    const message = verb + " solution: " + sol.meta.frontend_id + ". " + sol.meta.title + " (" + sol.meta.lang_display + ")";
    const commitUrl = await commitFiles(token, full, branch, files, message);
    return { commitUrl, manifest, created: !existing };
  }

  function authError(resp) {
    const e = new Error("GitHub HTTP " + resp.status);
    e.auth = resp.status === 401 || resp.status === 403;
    return e;
  }

  globalThis.LeetGitGH = {
    CLIENT_ID,
    isConfigured,
    startDeviceFlow,
    pollAccessToken,
    getUser,
    listRepos,
    createRepo,
    getDefaultBranch: async (token, full) => {
      const resp = await api(token, "/repos/" + full);
      if (!resp.ok) throw authError(resp);
      return (await resp.json()).default_branch || "main";
    },
    readManifest,
    pushSolution,
    buildIndex,
    mergeNotes,
  };
})();
