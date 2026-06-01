// GitHub access for the service worker (loaded via importScripts). Handles the
// OAuth device flow, repo listing/creation, and a single-commit push of a
// solved problem. Exposes globalThis.LeetGitGH.
(function () {
  "use strict";

  // Public OAuth App client id (safe to ship). Create an OAuth App with
  // "Device Flow" enabled and paste its Client ID here. See PUBLISHING.md.
  const CLIENT_ID = "Ov23libcmpS3IkE5eT3e";
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

  // One token-endpoint poll. Returns {access_token} | {error}.
  async function requestToken(deviceCode) {
    const resp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    return resp.json();
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
  function pct(v) {
    return v === null || v === undefined ? "N/A" : Number(v).toFixed(2) + "%";
  }

  // Build the per-problem README from a folder entry that may hold several
  // language solutions.
  function buildReadme(entry) {
    const m = entry.meta;
    const tags = m.tags && m.tags.length ? m.tags.join(", ") : "None";
    let s =
      "# " + m.frontend_id + ". " + m.title + "\n\n" +
      "- **Difficulty:** " + m.difficulty + "\n" +
      "- **Tags:** " + tags + "\n" +
      "- **Link:** " + m.url + "\n\n" +
      "## Problem\n\n" + (entry.statement_md || "_Problem statement unavailable._") + "\n\n" +
      "## Solutions\n\n";
    const sols = Object.values(entry.solutions).sort((a, b) =>
      String(b.solved_at || "").localeCompare(String(a.solved_at || ""))
    );
    for (const sol of sols) {
      s +=
        "### " + sol.lang_display + "\n\n" +
        "- **Runtime:** " + sol.runtime + " (beats " + pct(sol.runtime_pct) + ")\n" +
        "- **Memory:** " + sol.memory + " (beats " + pct(sol.memory_pct) + ")\n" +
        "- **Submitted:** " + (sol.submitted || "N/A") + "\n\n" +
        "See [" + sol.file + "](" + sol.file + ").\n\n";
    }
    s += NOTES_HEADING + "\n\n" + DEFAULT_NOTES + "\n";
    return s;
  }

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

  // Merge one accepted submission into the folder. Same language updates that
  // language's file in place; a new language adds a file alongside the others.
  async function pushSolution(token, full, branch, payload, manifest) {
    const folder = payload.folder;
    const sol = payload.solution;

    let entry = manifest[folder];
    if (!entry || !entry.solutions) entry = { folder: folder, solutions: {} };
    entry.meta = payload.problemMeta;
    entry.statement_md = payload.statementMd;

    const isNewLang = !entry.solutions[sol.ext];
    entry.solutions[sol.ext] = {
      lang_display: sol.lang_display,
      file: sol.file,
      runtime: sol.runtime,
      runtime_pct: sol.runtime_pct,
      memory: sol.memory,
      memory_pct: sol.memory_pct,
      solved_at: sol.solved_at,
      submitted: sol.submitted,
    };

    // Flat fields for the index and dashboard stats.
    const sols = Object.values(entry.solutions);
    entry.frontend_id = entry.meta.frontend_id;
    entry.title = entry.meta.title;
    entry.slug = entry.meta.slug;
    entry.difficulty = entry.meta.difficulty;
    entry.folder = folder;
    entry.lang_display = Array.from(new Set(sols.map((x) => x.lang_display))).join(", ");
    entry.solved_at = sols.map((x) => x.solved_at).filter(Boolean).sort().slice(-1)[0] || sol.solved_at;

    const existingReadme = await readFileText(token, full, folder + "/README.md", branch);
    let readme = buildReadme(entry);
    if (existingReadme) readme = mergeNotes(existingReadme, readme);

    manifest[folder] = entry;
    const files = {};
    files[folder + "/README.md"] = readme;
    files[folder + "/" + sol.file] = sol.code; // only this language's file is written
    files["README.md"] = buildIndex(Object.values(manifest));
    files[".leetgit/solved.json"] = JSON.stringify(manifest, null, 2) + "\n";

    const id = entry.meta.frontend_id, title = entry.meta.title, lang = sol.lang_display;
    let message;
    if (!existingReadme) message = "Add solution: " + id + ". " + title + " (" + lang + ")";
    else if (isNewLang) message = "Add " + lang + " solution: " + id + ". " + title;
    else message = "Update " + lang + " solution: " + id + ". " + title;

    const commitUrl = await commitFiles(token, full, branch, files, message);
    return { commitUrl, manifest, created: !existingReadme, isNewLang: isNewLang };
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
    requestToken,
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
    buildReadme,
    mergeNotes,
  };
})();
